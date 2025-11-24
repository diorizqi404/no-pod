const axios = require('axios');
const https = require('https');

class FastPanelService {
  constructor() {
    this.baseUrl = process.env.FASTPANEL_URL || 'https://127.0.0.1:8888';
    this.username = process.env.FASTPANEL_USERNAME;
    this.password = process.env.FASTPANEL_PASSWORD;
    this.ownerId = parseInt(process.env.FASTPANEL_OWNER_ID || '4');
    this.serverIp = process.env.FASTPANEL_SERVER_IP;
    
    // Token cache
    this.token = null;
    this.tokenExpire = null;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json'
      },
      // Disable SSL verification for self-signed certificates
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }
  
  /**
   * Login to FastPanel and get token
   */
  async login() {
    try {
      const response = await this.client.post('/login', {
        username: this.username,
        password: this.password
      });
      
      this.token = response.data.token;
      this.tokenExpire = new Date(response.data.expire);
      
      console.log(`✅ FastPanel login successful, token expires at ${this.tokenExpire}`);
      
      return this.token;
    } catch (error) {
      console.error('❌ FastPanel login failed:', error.response?.data || error.message);
      throw new Error(`FastPanel login failed: ${error.message}`);
    }
  }
  
  /**
   * Get valid token (auto-refresh if expired)
   */
  async getToken() {
    // Check if token exists and not expired
    if (this.token && this.tokenExpire) {
      const now = new Date();
      const timeUntilExpire = this.tokenExpire - now;
      
      // Refresh if less than 5 minutes remaining
      if (timeUntilExpire > 5 * 60 * 1000) {
        return this.token;
      }
    }
    
    // Login to get new token
    return await this.login();
  }
  
  /**
   * Add DNS domain to FastPanel
   */
  async addDomain(domain) {
    try {
      const token = await this.getToken();
      
      const domainData = {
        name: domain,
        ips: [
          {
            ip: this.serverIp
          }
        ],
        source: 'client',
        ns: 1
      };
      
      const response = await this.client.post('/api/dns/domains', domainData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`✅ FastPanel DNS domain added: ${domain}`);
      
      return {
        domainId: response.data.data.id,
        domain: domain,
        status: 'created'
      };
    } catch (error) {
      // Check if domain already exists
      if (error.response?.status === 409 || error.response?.data?.message?.includes('already exists')) {
        console.log(`⚠️  Domain ${domain} already exists, continuing...`);
        return {
          domain: domain,
          status: 'exists'
        };
      }
      console.error('❌ FastPanel add domain error:', error.response?.data || error.message);
      throw new Error(`Failed to add FastPanel domain: ${error.message}`);
    }
  }
  
  /**
   * Create new site with reverse proxy in FastPanel
   */
  async createSite(subdomain, port) {
    try {
      const token = await this.getToken();
      const domain = `${subdomain}.${process.env.BASE_DOMAIN}`;
      
      // Step 1: Add DNS domain first
      await this.addDomain(domain);
      
      // Step 2: Prepare site data
      const siteData = {
        domain: domain,
        aliases: [
          {
            name: `www.${domain}`
          }
        ],
        ips: [
          {
            ip: this.serverIp
          }
        ],
        owner: this.ownerId,
        mode: 'reverse_proxy',
        php_version: null,
        upstreams: [
          {
            type: 'host',
            address: `http://127.0.0.1:${port}`
          }
        ],
        database: null // Skip database creation
      };
      
      // Step 3: Create site using PUT method
      const siteResponse = await this.client.put('/api/master', siteData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const siteId = siteResponse.data.data.id;
      
      console.log(`✅ FastPanel site created: ${domain} → port ${port}`);
      
      // Step 4: Wait 5 seconds for DNS propagation
      console.log('⏳ Waiting 5 seconds for DNS propagation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 5: Create SSL certificate
      const ssl = await this.createSSL(domain, siteId);
      
      return {
        siteId: siteId,
        domain: domain,
        status: 'created',
        upstream: `http://127.0.0.1:${port}`,
        ssl: ssl
      };
    } catch (error) {
      console.error('❌ FastPanel create site error:', error.response?.data || error.message);
      throw new Error(`Failed to create FastPanel site: ${error.message}`);
    }
  }
  
  /**
   * Delete site from FastPanel
   */
  async deleteSite(domain) {
    try {
      const token = await this.getToken();
      
      // Get all sites
      const sitesResponse = await this.client.get('/api/master', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Find site by domain
      const sites = sitesResponse.data.data || sitesResponse.data;
      const site = sites.find(s => s.domain === domain);
      
      if (!site) {
        console.log(`⚠️  Site ${domain} not found in FastPanel`);
        return { status: 'not_found' };
      }
      
      // Delete site with all related resources
      await this.client.put(`/api/sites/${site.id}/delete`, {
        remove_databases: true,
        remove_dns_domains: false,
        remove_email_domains: true,
        remove_sub_domains: true,
        remove_dns_domains_from_provider: false
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`✅ FastPanel site deleted: ${domain}`);
      
      return {
        siteId: site.id,
        domain: domain,
        status: 'deleted'
      };
    } catch (error) {
      console.error('❌ FastPanel delete site error:', error.response?.data || error.message);
      throw new Error(`Failed to delete FastPanel site: ${error.message}`);
    }
  }
  
  /**
   * Update site proxy port
   */
  async updateSiteProxy(domain, newPort) {
    try {
      const token = await this.getToken();
      
      // Get all sites
      const sitesResponse = await this.client.get('/api/master', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Find site by domain
      const sites = sitesResponse.data.data || sitesResponse.data;
      const site = sites.find(s => s.domain === domain);
      
      if (!site) {
        throw new Error(`Site ${domain} not found`);
      }
      
      // Update site with new upstream
      const updateData = {
        ...site,
        upstreams: [
          {
            type: 'host',
            address: `http://127.0.0.1:${newPort}`
          }
        ]
      };
      
      await this.client.put(`/api/master`, updateData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`✅ FastPanel site updated: ${domain} → port ${newPort}`);
      
      return {
        siteId: site.id,
        domain: domain,
        port: newPort,
        status: 'updated'
      };
    } catch (error) {
      console.error('❌ FastPanel update site error:', error.response?.data || error.message);
      throw new Error(`Failed to update FastPanel site: ${error.message}`);
    }
  }
  
  /**
   * Get site info
   */
  async getSiteInfo(domain) {
    try {
      const token = await this.getToken();
      
      const sitesResponse = await this.client.get('/api/master', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const sites = sitesResponse.data.data || sitesResponse.data;
      const site = sites.find(s => s.domain === domain);
      
      if (!site) {
        return null;
      }
      
      return {
        siteId: site.id,
        domain: site.domain,
        upstreams: site.upstreams,
        mode: site.mode,
        status: site.status,
        enabled: site.enabled
      };
    } catch (error) {
      console.error('❌ FastPanel get site error:', error.response?.data || error.message);
      return null;
    }
  }
  
  /**
   * Create SSL certificate for site
   */
  async createSSL(domain, siteId) {
    try {
      const token = await this.getToken();
      
      const sslData = {
        type: 'letsencrypt',
        email: process.env.FASTPANEL_SSL_EMAIL || `admin@${domain}`,
        common_name: domain,
        alternative_name: `www.${domain}`,
        force_dns_validation: false,
        virtualhost: siteId,
        length: 2048
      };
      
      const sslResponse = await this.client.post('/api/certificates', sslData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`✅ FastPanel SSL certificate created for: ${domain}`);
      
      return {
        certificateId: sslResponse.data.data.id,
        domain: domain,
        status: 'creating',
        expiresAt: sslResponse.data.data.expired_at
      };
    } catch (error) {
      console.error('❌ FastPanel SSL creation error:', error.response?.data || error.message);
      // Don't throw error, SSL is optional
      console.log('⚠️  Continuing without SSL...');
      return null;
    }
  }
  
  /**
   * Test FastPanel API connection
   */
  async testConnection() {
    try {
      await this.login();
      console.log('✅ FastPanel API connection successful');
      return true;
    } catch (error) {
      console.error('❌ FastPanel API connection failed:', error.message);
      return false;
    }
  }
}

module.exports = new FastPanelService();
