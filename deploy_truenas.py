import os, sys, tarfile, io, paramiko

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = '192.168.0.245'
USER = 'root'
PASS = 'admin'
PORT = 16010
LOCAL_DIR = r"c:\Users\CHRISTOPHER\Downloads\ss\christos"
REMOTE_BUILD_DIR = "/root/christos_build"
REMOTE_DATA_DIR = "/mnt/DISK_MAC/christos_data"

print(f"=== Starting Production Deployment to TrueNAS SCALE ({HOST}) ===")

# 1. Package local project into tar.gz in memory
print("Packaging project files...")
tar_buffer = io.BytesIO()
with tarfile.open(fileobj=tar_buffer, mode="w:gz") as tar:
    for root, dirs, files in os.walk(LOCAL_DIR):
        dirs[:] = [d for d in dirs if d not in ['.git', '__pycache__', 'node_modules']]
        for file in files:
            if file.endswith(('.tmp', '.log')):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, LOCAL_DIR)
            tar.add(full_path, arcname=rel_path)

tar_buffer.seek(0)
tar_size = len(tar_buffer.getvalue())
print(f"Archive created successfully ({tar_size / 1024:.1f} KB).")

# 2. Connect via SSH & SFTP
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=22, username=USER, password=PASS, timeout=15)
print("Connected to TrueNAS via SSH.")

sftp = ssh.open_sftp()

def run_cmd(cmd, desc=""):
    if desc:
        print(f"[*] {desc}...")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if exit_status != 0:
        print(f"[!] Error executing: {cmd}")
        print("Output:", out)
        print("Error:", err)
        raise Exception(f"Command failed with code {exit_status}")
    return out

run_cmd(f"mkdir -p {REMOTE_BUILD_DIR} {REMOTE_DATA_DIR}", "Creating build and data directories")

# 4. Upload archive to TrueNAS
print("Uploading archive via SFTP...")
remote_tar_path = "/root/christos_build.tar.gz"
with sftp.file(remote_tar_path, "wb") as f:
    f.write(tar_buffer.getvalue())
sftp.close()
print("Archive uploaded.")

# 5. Extract archive
run_cmd(f"rm -rf {REMOTE_BUILD_DIR} && mkdir -p {REMOTE_BUILD_DIR} && tar -xzf {remote_tar_path} -C {REMOTE_BUILD_DIR}", "Extracting files")

# 6. Build Docker Image
print("[*] Building Docker image 'christos:latest' on TrueNAS...")
stdin, stdout, stderr = ssh.exec_command(f"docker build -t christos:latest {REMOTE_BUILD_DIR}")

while True:
    line = stdout.readline()
    if not line:
        break
    print("  [DOCKER BUILD]", line.strip())

exit_status = stdout.channel.recv_exit_status()
if exit_status != 0:
    err = stderr.read().decode('utf-8', errors='replace')
    raise Exception(f"Docker build failed: {err}")

print("Docker image 'christos:latest' built successfully.")

# 7. Stop and remove existing container if present
run_cmd("docker rm -f christos 2>/dev/null || true", "Removing existing container")

# 8. Run production Docker container with docker.sock and full storage mounts
docker_run_cmd = (
    f"docker run -d --name christos --restart unless-stopped "
    f"-p {PORT}:80 "
    f"-v /var/run/docker.sock:/var/run/docker.sock "
    f"-v /mnt/DISK_MAC:/mnt/DISK_MAC "
    f"-v {REMOTE_DATA_DIR}:/data "
    f"-e DB_TYPE=sqlite "
    f"-e DB_SQLITE_PATH=/data/christos.db "
    f"christos:latest"
)

container_id = run_cmd(docker_run_cmd, f"Starting container on port {PORT}")
print(f"Container started with ID: {container_id[:12]}")

# 9. Set permissions on data dir
run_cmd(f"chmod -R 777 {REMOTE_DATA_DIR}", "Setting data directory permissions")

# 10. Run library scan inside container
print("\n[*] Triggering music library scan...")
scan_out = run_cmd("docker exec christos php /var/www/html/api/scanner.php", "Running music scanner")
print(scan_out)

# 11. Test HTTP endpoints
print("\n[*] Testing HTTP response from http://127.0.0.1:16010...")
http_test = run_cmd(f'curl -s "http://127.0.0.1:{PORT}/api/library.php?action=libraries"', "Testing Libraries API")
print("Libraries API Output:\n", http_test)

http_movies = run_cmd(f'curl -s "http://127.0.0.1:{PORT}/api/movies.php?action=list" | head -c 300', "Testing Movies API")
print("\nMovies API Output:\n", http_movies)

http_files = run_cmd(f'curl -s "http://127.0.0.1:{PORT}/api/files.php?action=list&root=thecus" | head -c 300', "Testing File Browser API")
print("\nFile Browser API Output:\n", http_files)

# Clean up remote tarball
ssh.exec_command(f"rm -f {remote_tar_path}")

ssh.close()
print(f"\n🎉 DEPLOYMENT COMPLETE! Access the app on your LAN at: http://{HOST}:{PORT}")