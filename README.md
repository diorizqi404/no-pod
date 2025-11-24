# No-Pod - Container Automation Platform

Self-hosted platform for automated deployment and management of containerized applications with reverse proxy and SSL support.

> **⚠️ Important Notice**  
> **No-Pod** uses **FastPanel** with NGINX for managing reverse proxy and SSL certificates. You must have FastPanel installed and configured on your server before using this platform.  
> 


## ✨ Features

- 🚀 **Multi-service support** - Modular architecture for any Docker-based service
- 🔄 **Automated deployment** - One-click container creation with reverse proxy
- 🔐 **Auto SSL** - Automatic Let's Encrypt certificate generation
- 📊 **Resource management** - CPU and memory limits per container
- 🌐 **Subdomain routing** - Automatic subdomain assignment and DNS
- 📦 **Backup & restore** - Built-in data backup functionality
- 🔌 **RESTful API** - Complete API with Swagger documentation
- 🎯 **Error handling** - Automatic cleanup on failures

## 🏗️ Architecture

```
User Request → No-Pod API → Docker Container
                  ↓              ↓
              MySQL DB    FastPanel (NGINX)
                              ↓
                         Reverse Proxy + SSL
                              ↓
                          Live Site
```

**How it works:**
1. User creates container via No-Pod API
2. No-Pod creates Docker container on specified port
3. No-Pod calls FastPanel API to create site with reverse proxy
4. FastPanel configures NGINX to route domain → container port
5. FastPanel generates Let's Encrypt SSL certificate
6. Site is live with HTTPS

## 📋 Prerequisites

- **FastPanel** - Control panel with NGINX (required for reverse proxy & SSL)
- **Node.js** 16 or higher
- **Docker** & Docker Compose
- **MySQL** 8.0 or higher
- **Domain** with wildcard DNS configured

### Installing FastPanel

```bash
# Install FastPanel (Ubuntu/Debian)
curl -sSL https://fastpanel.direct/install.sh | bash

# Access FastPanel
https://your-server-ip:8888
```

For detailed installation instructions, visit [FastPanel Documentation](https://fastpanel.direct/docs)

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/diorizqi404/no-pod.git
cd no-pod
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required configuration:**

```bash
# API Configuration
API_PORT=6000

# MySQL Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=no_pod

# Domain Configuration
BASE_DOMAIN=yourdomain.com

# Port Range for Containers
PORT_RANGE_START=14000
PORT_RANGE_END=14999

# FastPanel Configuration (Required)
FASTPANEL_URL=https://127.0.0.1:8888
FASTPANEL_USERNAME=admin
FASTPANEL_PASSWORD=your_password
FASTPANEL_OWNER_ID=4
FASTPANEL_SERVER_IP=your_server_ip
FASTPANEL_SSL_EMAIL=admin@yourdomain.com
```

### 3. Setup Database

```bash
mysql -u root -p < database/schema.sql
```

### 4. Start Server

```bash
# Development
npm start

# Production (with PM2)
pm2 start api/server.js --name no-pod
pm2 save
```

### 5. Access API Documentation

Open browser: `http://localhost:6000/api-docs`


## 🔧 Adding New Services

### 1. Create Service Template

Create a new folder in `services/`:

```
services/
└── your-service/
    ├── docker-compose.yaml
    ├── .env.template
    └── config.json
```

**docker-compose.yaml:**
```yaml
services:
  your-service:
    image: your-image:latest
    container_name: ${CONTAINER_NAME}
    restart: always
    user: "1000:1000"
    ports:
      - "127.0.0.1:${PORT}:8080"
    env_file:
      - path: ./.env
    volumes:
      - ./data:/app/data
    deploy:
      resources:
        limits:
          cpus: '${CPU_LIMIT}'
          memory: ${MEMORY_LIMIT}
```

**.env.template:**
```bash
INSTANCE_NAME=${INSTANCE_NAME}
CONTAINER_NAME=${CONTAINER_NAME}
SUBDOMAIN=${SUBDOMAIN}
PORT=${PORT}
BASE_DOMAIN=${BASE_DOMAIN}
CPU_LIMIT=1
MEMORY_LIMIT=512M
```

**config.json:**
```json
{
  "name": "your-service",
  "description": "Your service description",
  "version": "latest",
  "defaultPort": 8080,
  "defaultCpu": "1",
  "defaultMemory": "512M",
  "requiredEnvVars": [
    "INSTANCE_NAME",
    "CONTAINER_NAME",
    "SUBDOMAIN",
    "PORT",
    "BASE_DOMAIN"
  ]
}
```

### 2. Register Service in Database

```sql
INSERT INTO services (name, description, default_port, default_cpu, default_memory)
VALUES ('your-service', 'Your service description', 8080, '1', '512M');
```

### 3. Use via API

```bash
curl -X POST http://localhost:6000/api/containers \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "test",
    "service": "your-service"
  }'
```

## 📁 Project Structure

```
.
├── api/
│   ├── config/              # Database & Swagger configuration
│   ├── routes/              # API route definitions
│   ├── services/            # Business logic layer
│   └── server.js            # Express server entry point
├── services/                # Service templates
│   ├── n8n/                 # n8n workflow automation
│   ├── gowa/                # Example service
│   └── your-service/        # Add your services here
├── users/                   # Generated container instances
├── backups/                 # Container data backups
├── database/                # SQL schema and migrations
└── docs/                    # Additional documentation
```

## 🔐 Security Considerations

- Change default passwords in `.env`
- Use strong MySQL passwords
- Configure firewall rules (ports 80, 443, 14000-14999)
- Enable SSL for API endpoint
- Restrict API access with authentication (recommended)
- Regular security updates for Docker images

## 🌐 DNS Configuration

Configure wildcard DNS for automatic subdomain routing:

```
Type: A
Name: *
Value: YOUR_SERVER_IP
TTL: 300
```

This enables:
- `app1-n8n.yourdomain.com` → Container 1
- `app2-n8n.yourdomain.com` → Container 2
- etc.

## 🐛 Troubleshooting

### Container won't start
```bash
# Check Docker logs
docker logs <container-name>

# Check permissions
ls -la users/<container-folder>/data
```

### Port conflicts
```bash
# Check port usage
netstat -tulpn | grep <port>

# Check database
mysql -u root -p container_automation
SELECT * FROM port_assignments WHERE is_available = FALSE;
```

### API connection issues
```bash
# Check API logs
pm2 logs container-api

# Test health endpoint
curl http://localhost:6000/health
```