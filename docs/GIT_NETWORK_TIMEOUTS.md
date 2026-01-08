# Git Network Timeouts

## Problem

Git or GitHub CLI operations timeout or hang indefinitely when network is slow or unstable.

**Symptoms:**

- `git push` hangs forever
- `gh pr create` fails with timeout
- Operations sometimes succeed, sometimes fail
- No error messages or feedback

## Quick Diagnosis

1. **Check network connectivity:**

   ```bash
   ping github.com
   ```

2. **Check network latency and packet loss:**

   ```bash
   mtr github.com     # Linux/Mac
   traceroute github.com  # Alternative
   ```

3. **Verify Git configuration:**

   ```bash
   git config --list | grep -E '(http|ssh)'
   ```

4. **Check GitHub status:**
   Visit https://www.githubstatus.com/

## Configuration

DevFlow automatically configures Git for slow networks on server startup. You can also customize settings via environment variables.

### Environment Variables (Optional)

All variables are **optional** - DevFlow uses sensible defaults if not set.

```bash
# Git HTTP timeout in seconds (default: 600 = 10 minutes)
GIT_HTTP_TIMEOUT=600

# Git HTTP post buffer size in bytes (default: 524288000 = 500MB)
GIT_HTTP_POST_BUFFER=524288000

# GitHub CLI timeout in milliseconds (default: 60000 = 1 minute)
GH_CLI_TIMEOUT=60000

# Maximum retry attempts for failed operations (default: 3)
# Uses exponential backoff: 1s, 2s, 4s, ...
GIT_MAX_RETRIES=3
```

### Automatic Git Configuration

On server startup, DevFlow automatically configures:

```bash
# Disable low-speed limits (prevents timeout on slow networks)
git config --global http.lowSpeedLimit 0
git config --global http.lowSpeedTime 999999

# Increase HTTP buffer size to 500MB for large pushes
git config --global http.postBuffer 524288000

# Configure SSH keepalive for long-running operations
git config --global core.sshCommand "ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=3"
```

## Retry Logic

All Git and GitHub CLI operations now use **automatic retry with exponential backoff**:

1. **First attempt:** 60 second timeout
2. **Retry 1:** 120 second timeout (2x), after 1 second delay
3. **Retry 2:** 240 second timeout (4x), after 2 seconds delay
4. **Retry 3:** 480 second timeout (8x), after 4 seconds delay

**Total time before giving up:** ~15 minutes

## Manual Troubleshooting

If operations still fail after automatic retries:

### 1. Try HTTPS instead of SSH

Sometimes HTTPS performs better than SSH on restrictive networks.

```bash
# Check current remote
git remote -v

# Switch to HTTPS
git remote set-url origin https://github.com/owner/repo.git

# Try push again
git push origin main
```

### 2. Check for network restrictions

Some corporate networks or ISPs block Git:

```bash
# Test HTTP access to GitHub
curl -I https://github.com

# Test SSH access to GitHub
ssh -T git@github.com
```

### 3. Verify Git configuration

```bash
# Check all Git configuration
git config --list --global

# Verify HTTP settings
git config --global --get http.postBuffer
git config --global --get http.lowSpeedLimit
git config --global --get http.lowSpeedTime

# Verify SSH settings
git config --global --get core.sshCommand
```

### 4. Manually increase timeout

For a one-off large push, temporarily increase timeout:

```bash
# Single command with increased timeout
git -c http.lowSpeedTime=999999 -c http.postBuffer=524288000 push origin main
```

### 5. Use shallow clone for large repos

If cloning a large repository fails:

```bash
# Clone only the latest commit (much faster)
git clone --depth 1 https://github.com/owner/repo.git

# Later, fetch full history if needed
git fetch --unshallow
```

## Common Issues

### Issue: "fatal: unable to access 'https://github.com/...': Could not resolve host: github.com"

**Cause:** DNS or network connectivity issue

**Solution:**

1. Check internet connection: `ping github.com`
2. Try using Google DNS (8.8.8.8)
3. Check firewall/antivirus settings
4. Try from different network (hotspot, mobile)

### Issue: "fatal: HTTP request fails"

**Cause:** HTTP timeout or connection error

**Solution:**

1. Check GitHub status: https://www.githubstatus.com/
2. Switch to HTTPS: `git remote set-url origin https://github.com/owner/repo.git`
3. Increase buffer size: `git config --global http.postBuffer 524288000`
4. Disable compression: `git config --global http.compression 0`

### Issue: "Connection timed out" during git push

**Cause:** Network too slow or unstable

**Solution:**

1. Increase timeout: `git config --global http.lowSpeedTime 999999`
2. Disable low-speed limit: `git config --global http.lowSpeedLimit 0`
3. Try smaller commits (split large changes into smaller pushes)
4. Use SSH instead of HTTPS (or vice versa)

### Issue: "gh: command not found"

**Cause:** GitHub CLI not installed

**Solution:**

```bash
# Install GitHub CLI
# macOS
brew install gh

# Linux
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

## Monitoring

DevFlow logs all Git operations with retry information:

```
[Server] Configuring Git for network reliability...
[Server] ✓ Git configured for slow networks
[CreatePR] Push succeeded on attempt 1 after 2 retries
```

Check logs for retry patterns - frequent retries indicate network issues.

## Best Practices

1. **Commit frequently** - Smaller pushes are less likely to timeout
2. **Use auto-retry** - All operations retry automatically, no manual intervention needed
3. **Monitor logs** - Check server logs for retry patterns
4. **Test network** - Run `mtr github.com` before starting work
5. **Use sensible defaults** - Most users don't need to customize configuration

## Additional Resources

- [Git HTTP Configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-http)
- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [Git SSH Configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-ssh)

## FAQ

**Q: Do I need to configure these settings manually?**

A: No - DevFlow automatically configures Git on server startup. Environment variables are optional.

**Q: How many times will Git operations retry?**

A: Up to 3 retries with exponential backoff (1s, 2s, 4s delays).

**Q: What if operations still fail after all retries?**

A: Check your network connection, GitHub status, and try manual troubleshooting steps above.

**Q: Can I disable retry logic?**

A: Set `GIT_MAX_RETRIES=0` in `.env` to disable retries.

**Q: Why use HTTPS vs SSH?**

A: HTTPS often works better on restrictive networks, SSH may be faster on good networks. Try both if one fails.

**Q: Does this affect git clone operations?**

A: Retry logic is applied to most Git operations, including clone, push, pull, fetch, and GitHub CLI commands.
