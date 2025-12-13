# Production Deployment Guide

This guide covers deploying Interlock in production environments with best practices for reliability, security, and maintainability.

---

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 4 GB
- Disk: 10 GB free space
- OS: Linux (Ubuntu 20.04+, RHEL 8+, or similar)

**Recommended (for 1M+ vectors @ 1000 QPS):**
- CPU: 8+ cores
- RAM: 16+ GB
- Disk: 50+ GB SSD
- OS: Linux (Ubuntu 22.04 or RHEL 9)

### Software Dependencies

- **Node.js**: 18.x or 20.x (LTS versions)
- **Python**: 3.9, 3.10, or 3.11
- **npm**: 8.x or higher

### Network Requirements

- Outbound HTTPS (443) for package downloads
- Inbound connections to your application port (configurable)
- No special firewall rules for Interlock itself

---

## Deployment Patterns

### 1. Kubernetes (Recommended for Production)

#### Helm Chart Example

```yaml
# interlock-values.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: interlock-config
  namespace: production
data:
  INTERLOCK_SIGNING_KEY: "" # Set via secret, not configmap
  NODE_ENV: "production"

---
apiVersion: v1
kind: Secret
metadata:
  name: interlock-secrets
  namespace: production
type: Opaque
stringData:
  INTERLOCK_SIGNING_KEY: "your-production-signing-key-here"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: interlock
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: interlock
  template:
    metadata:
      labels:
        app: interlock
    spec:
      containers:
      - name: interlock
        image: your-registry/interlock:5.0.0
        env:
        - name: INTERLOCK_SIGNING_KEY
          valueFrom:
            secretKeyRef:
              name: interlock-secrets
              key: INTERLOCK_SIGNING_KEY
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        volumeMounts:
        - name: state-storage
          mountPath: /app/state
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: state-storage
        persistentVolumeClaim:
          claimName: interlock-state-pvc

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: interlock-state-pvc
  namespace: production
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: fast-ssd

---
apiVersion: v1
kind: Service
metadata:
  name: interlock-service
  namespace: production
spec:
  selector:
    app: interlock
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

#### Deployment Commands

```bash
# Create namespace
kubectl create namespace production

# Apply configuration
kubectl apply -f interlock-values.yaml

# Verify deployment
kubectl get pods -n production
kubectl logs -f deployment/interlock -n production

# Check service
kubectl get svc -n production
```

---

### 2. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  interlock:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./:/app
      - ./state:/app/state
    environment:
      - NODE_ENV=production
      - INTERLOCK_SIGNING_KEY=${INTERLOCK_SIGNING_KEY}
    ports:
      - "3000:3000"
    command: >
      sh -c "npm ci --production &&
             npm run build &&
             node dist/index.js"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

volumes:
  state:
    driver: local
```

#### Deployment Commands

```bash
# Set signing key
export INTERLOCK_SIGNING_KEY="your-production-key"

# Start service
docker-compose up -d

# View logs
docker-compose logs -f interlock

# Stop service
docker-compose down
```

---

### 3. Systemd Service

```ini
# /etc/systemd/system/interlock.service
[Unit]
Description=Interlock Circuit Breaker
After=network.target

[Service]
Type=simple
User=interlock
Group=interlock
WorkingDirectory=/opt/interlock
Environment="NODE_ENV=production"
Environment="INTERLOCK_SIGNING_KEY=your-production-key"
ExecStart=/usr/bin/node /opt/interlock/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=interlock

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/interlock/state

[Install]
WantedBy=multi-user.target
```

#### Setup Commands

```bash
# Create user
sudo useradd -r -s /bin/false interlock

# Install Interlock
sudo mkdir -p /opt/interlock
sudo cp -r . /opt/interlock/
sudo chown -R interlock:interlock /opt/interlock

# Install dependencies
cd /opt/interlock
sudo -u interlock npm ci --production

# Build
sudo -u interlock npm run build

# Create state directory
sudo mkdir -p /opt/interlock/state
sudo chown interlock:interlock /opt/interlock/state
sudo chmod 700 /opt/interlock/state

# Install service
sudo cp interlock.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable interlock
sudo systemctl start interlock

# Check status
sudo systemctl status interlock
sudo journalctl -u interlock -f
```

---

## Configuration Tuning

### 1. Hardware Fingerprint Configuration

```typescript
// Configure based on your deployment
const config: HysteresisConfig = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  
  // Enable hardware fingerprinting
  enableHardwareFingerprint: true,
  
  // 20% tolerance for container memory changes
  hardwareDriftTolerance: 0.20,
  
  // State file path (persistent storage)
  stateFilePath: '/app/state/interlock_state.json'
};
```

### 2. Quality Floor Calibration

Set quality floor based on your application's requirements:

```typescript
const config: HysteresisConfig = {
  // For search applications: 50-60% recall minimum
  qualityFloor: 0.5,
  qualityFloorEnabled: true,
  
  // For recommendation systems: 40-50% recall minimum
  // qualityFloor: 0.4,
  
  // For critical systems: 70-80% recall minimum
  // qualityFloor: 0.7,
};
```

**Calibration Process:**
1. Start in shadow mode (`dryRun: true`)
2. Monitor shadow blocks for quality floor violations
3. Adjust `qualityFloor` based on acceptable trade-offs
4. Enable active mode after validation

### 3. Hysteresis Parameters

Tune recovery behavior based on workload:

```typescript
const config: HysteresisConfig = {
  // How long to stay in OPEN before considering recovery
  minimumOpenDurationMs: 5000,  // 5 seconds default
  
  // How many safe intervals before HALF_OPEN
  consecutiveIntervalsForHalfOpen: 5,
  
  // How many successful probe windows before CLOSED
  consecutiveWindowsForClose: 5,
  
  // Flash crowd detection threshold
  flashThreshold: 2.0,  // 2x load spike triggers reflex
  
  // Reflex cooldown period
  reflexCooldownMs: 30000  // 30 seconds
};
```

**Tuning Guidelines:**
- **High-traffic services**: Shorter `minimumOpenDurationMs` (3-5s)
- **Batch processing**: Longer `minimumOpenDurationMs` (10-30s)
- **Volatile workloads**: Higher `consecutiveIntervalsForHalfOpen` (7-10)
- **Stable workloads**: Lower `consecutiveIntervalsForHalfOpen` (3-5)

---

## Monitoring & Observability

### 1. Metrics to Track

#### Core Interlock Metrics

```typescript
// Export metrics for monitoring
import { globalMetrics } from './services/metrics';

// Periodically export
setInterval(() => {
  const metrics = globalMetrics.exportJSON();
  console.log(JSON.stringify(metrics));
  
  // Or send to monitoring system
  // sendToDatadog(metrics);
  // sendToPrometheus(metrics);
}, 60000); // Every minute
```

**Key Metrics:**
- `shadow_blocks_total`: Shadow mode blocks
- `reflex_trips_total`: Flash crowd reflex triggers
- `quality_refusals_total`: Quality floor refusals
- `state_transitions_total`: Circuit breaker state changes
- `interventions_total`: Total protective interventions

#### System Metrics

Monitor these alongside Interlock:
- **Memory usage**: Track for leaks
- **CPU usage**: Should be low (<10% typically)
- **Disk I/O**: State file writes
- **Network**: Application traffic

### 2. Alerting Recommendations

#### Critical Alerts

```yaml
# Sustained OPEN state
- alert: InterlockSustainedOpen
  expr: interlock_state == 2 for 5m
  severity: critical
  message: "Interlock in OPEN state for 5+ minutes"

# Memory leak detected
- alert: InterlockMemoryLeak
  expr: rate(interlock_memory_mb[10m]) > 10
  severity: critical
  message: "Possible memory leak in Interlock"

# High refusal rate
- alert: InterlockHighRefusals
  expr: rate(quality_refusals_total[5m]) > 10
  severity: warning
  message: "High quality floor refusal rate"
```

#### Warning Alerts

```yaml
# Frequent state transitions
- alert: InterlockFlapping
  expr: rate(state_transitions_total[5m]) > 5
  severity: warning
  message: "Frequent state transitions (possible flapping)"

# Flash crowd reflexes
- alert: InterlockReflexTrips
  expr: rate(reflex_trips_total[10m]) > 3
  severity: warning
  message: "Multiple flash crowd reflexes detected"
```

### 3. Dashboard Examples

#### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Interlock Monitoring",
    "panels": [
      {
        "title": "Circuit Breaker State",
        "targets": [
          {
            "expr": "interlock_state",
            "legendFormat": "State (0=CLOSED, 1=HALF_OPEN, 2=OPEN)"
          }
        ]
      },
      {
        "title": "Interventions Rate",
        "targets": [
          {
            "expr": "rate(interventions_total[5m])",
            "legendFormat": "Interventions/sec"
          }
        ]
      },
      {
        "title": "Quality Floor Refusals",
        "targets": [
          {
            "expr": "rate(quality_refusals_total[5m])",
            "legendFormat": "Refusals/sec"
          }
        ]
      }
    ]
  }
}
```

#### Datadog Dashboard

```yaml
# Datadog metrics
- metric: interlock.state
  type: gauge
  tags: [env:production, service:interlock]

- metric: interlock.interventions
  type: count
  tags: [env:production, service:interlock]

- metric: interlock.refusals
  type: count
  tags: [env:production, service:interlock]
```

---

## Troubleshooting

### Common Issues

#### 1. State File Corruption

**Symptoms:**
- Logs show: "State file corrupted, failing safe to OPEN"
- Breaker always starts in OPEN state

**Solution:**
```bash
# Backup corrupted state
mv interlock_state.json interlock_state.json.backup

# Restart service (will create fresh state)
systemctl restart interlock

# Review backup to understand corruption
cat interlock_state.json.backup
```

#### 2. Hardware Mismatch Warnings

**Symptoms:**
- Logs show: "Hardware fingerprint mismatch"
- State invalidated on startup

**Solution:**
```bash
# This is expected when moving to different hardware
# To force state transfer (use with caution):

# 1. Edit state file to match new hardware
# 2. Or delete state and start fresh:
rm interlock_state.json
systemctl restart interlock
```

#### 3. Excessive Interventions

**Symptoms:**
- Too many state transitions
- Constant OPEN/HALF_OPEN cycling

**Solution:**
```typescript
// Increase hysteresis parameters
const config: HysteresisConfig = {
  minimumOpenDurationMs: 10000,  // Increase from 5s to 10s
  consecutiveIntervalsForHalfOpen: 10,  // Increase from 5 to 10
  consecutiveWindowsForClose: 10  // Increase from 5 to 10
};
```

#### 4. False Positives in Shadow Mode

**Symptoms:**
- Shadow blocks show interventions that seem unnecessary

**Solution:**
```typescript
// Adjust thresholds based on your workload
const circuitConfig = {
  hazardThreshold: 0.8,  // Increase from 0.7 (more permissive)
  minimumConfidence: 0.6  // Decrease from 0.7 (less strict)
};
```

### Debug Logging

Enable detailed logging for troubleshooting:

```typescript
// In your configuration
const config: HysteresisConfig = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  debugLogging: true  // Enable verbose logs
};
```

View logs:
```bash
# Systemd
sudo journalctl -u interlock -f

# Docker
docker-compose logs -f interlock

# Kubernetes
kubectl logs -f deployment/interlock -n production
```

### Performance Tuning

If experiencing high latency:

1. **Check memory usage**: Ensure sufficient RAM
2. **Review state file size**: Should be <1MB typically
3. **Monitor disk I/O**: SSD recommended for state storage
4. **Profile application**: Use Node.js profiler

```bash
# Profile Node.js application
node --prof dist/index.js

# Generate readable profile
node --prof-process isolate-*.log > profile.txt
```

---

## Upgrade Path

### Zero-Downtime Upgrade

#### Rolling Update (Kubernetes)

```bash
# Update image version
kubectl set image deployment/interlock \
  interlock=your-registry/interlock:5.1.0 \
  -n production

# Monitor rollout
kubectl rollout status deployment/interlock -n production

# Rollback if needed
kubectl rollout undo deployment/interlock -n production
```

#### Blue-Green Deployment (Docker/Systemd)

```bash
# 1. Deploy new version alongside old
docker-compose -f docker-compose.blue.yml up -d

# 2. Validate new version
curl http://localhost:3001/health

# 3. Switch traffic (update load balancer)

# 4. Stop old version
docker-compose -f docker-compose.green.yml down
```

### Backward Compatibility

**v5.x → v5.x minor updates**: Fully backward compatible
- State file format unchanged
- Configuration compatible
- No breaking changes

**v4.x → v5.x major updates**: Migration required
- State file schema updated
- See [MIGRATION.md](./MIGRATION.md) for details

### Migration Guides

#### v4.x to v5.x

```bash
# 1. Backup state
cp interlock_state.json interlock_state_v4.json.backup

# 2. Update Interlock
npm install interlock@5.0.0

# 3. Run migration script
npx tsx scripts/migrate-v4-to-v5.ts

# 4. Verify migration
npx tsx scripts/verify-state.ts

# 5. Restart service
systemctl restart interlock
```

---

## Security Checklist

Before deploying to production:

- [ ] Set `INTERLOCK_SIGNING_KEY` via environment variable (not hardcoded)
- [ ] Restrict state file permissions (`chmod 600`)
- [ ] Enable hardware fingerprinting
- [ ] Use HTTPS for external connections
- [ ] Review [SECURITY.md](../SECURITY.md) for security policy
- [ ] Run `npm audit` to check for vulnerabilities
- [ ] Enable security monitoring/alerting
- [ ] Document incident response procedures

---

## Support

### Getting Help

- **Documentation**: Check [docs/](../docs)
- **Issues**: [GitHub Issues](https://github.com/CULPRITCHAOS/Interlock/issues)
- **Security**: See [SECURITY.md](../SECURITY.md)
- **Contributing**: See [CONTRIBUTING.md](../CONTRIBUTING.md)

### Professional Support

For production support or consulting:
- Open a GitHub Discussion
- Tag issues with `production` label
- Provide detailed environment information

---

**Last Updated**: 2025-12-13

*This deployment guide is maintained by the Interlock team. Submit improvements via pull request.*
