module.exports = function(RED) {
    const EventSource = require('eventsource');
    
    function MCPSSENode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Get configuration node
        const mcpConfig = RED.nodes.getNode(config.server);
        
        if (!mcpConfig) {
            node.error("MCP configuration missing");
            return;
        }
        
        // Initialize node status
        node.status({fill: "red", shape: "ring", text: "disconnected"});
        
        // Store configuration
        this.server = config.server;
        this.eventTypes = config.eventTypes || "";
        this.deviceId = config.deviceId || "";
        this.reconnectTimeout = config.reconnectTimeout || 5000;
        this.useHttps = config.useHttps || false;
        this.additionalParams = config.additionalParams || "";
        this.eventSource = null;
        this.reconnectTimer = null;
        
        // Connect to SSE endpoint
        this.connect = function() {
            if (node.eventSource) {
                node.eventSource.close();
                node.eventSource = null;
            }
            
            clearTimeout(node.reconnectTimer);
            
            // Build SSE URL
            let protocol = this.useHttps ? 'https' : 'http';
            let sseUrl = `${protocol}://${mcpConfig.host}:${mcpConfig.port}/sse`;
            
            // Add query parameters if specified
            const params = [];
            if (node.eventTypes) {
                params.push(`events=${encodeURIComponent(node.eventTypes)}`);
            }
            if (node.deviceId) {
                params.push(`deviceId=${encodeURIComponent(node.deviceId)}`);
            }
            
            // Add additional params from configuration
            if (this.additionalParams) {
                const additionalParamsArray = this.additionalParams.split('&').filter(p => p.trim() !== '');
                params = params.concat(additionalParamsArray);
            }
            
            if (params.length > 0) {
                sseUrl += `?${params.join('&')}`;
            }
            
            // Set up authorization headers if needed
            const options = {
                https: {
                    rejectUnauthorized: false // Allow self-signed certificates
                }
            };
            
            if (mcpConfig.authKey) {
                options.headers = {
                    'Authorization': `Bearer ${mcpConfig.authKey}`
                };
            }
            
            node.log(`Connecting to SSE endpoint: ${sseUrl}`);
            node.status({fill: "yellow", shape: "ring", text: "connecting..."});
            
            try {
                // Create EventSource
                node.eventSource = new EventSource(sseUrl, options);
                
                // Handle connection open
                node.eventSource.onopen = function() {
                    node.log("Connected to MCP SSE endpoint");
                    node.status({fill: "green", shape: "dot", text: "connected"});
                };
                
                // Handle messages
                node.eventSource.onmessage = function(event) {
                    try {
                        const data = JSON.parse(event.data);
                        node.send({
                            topic: data.type || "mcp/event",
                            payload: data,
                            event: {
                                id: event.lastEventId,
                                timestamp: Date.now()
                            }
                        });
                    } catch (error) {
                        node.warn(`Error parsing SSE data: ${error.message}`);
                        node.send({
                            topic: "mcp/event",
                            payload: event.data,
                            event: {
                                id: event.lastEventId,
                                timestamp: Date.now(),
                                error: "Parse error"
                            }
                        });
                    }
                };
                
                // Handle specific event types
                node.eventSource.addEventListener('error', function(event) {
                    node.error("SSE connection error");
                    node.status({fill: "red", shape: "dot", text: "error"});
                    node.disconnect();
                });
                
                // Handle device events if configured
                if (node.deviceId) {
                    node.eventSource.addEventListener('device', function(event) {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.deviceId === node.deviceId) {
                                node.send({
                                    topic: `device/${data.deviceId}`,
                                    payload: data,
                                    event: {
                                        id: event.lastEventId,
                                        timestamp: Date.now()
                                    }
                                });
                            }
                        } catch (error) {
                            node.warn(`Error parsing device event data: ${error.message}`);
                        }
                    });
                }
                
            } catch (error) {
                node.error(`Failed to connect to SSE endpoint: ${error.message}`);
                node.status({fill: "red", shape: "dot", text: "connection failed"});
                node.scheduleReconnect();
            }
        };
        
        // Disconnect from SSE endpoint
        this.disconnect = function() {
            if (node.eventSource) {
                node.eventSource.close();
                node.eventSource = null;
            }
            
            node.status({fill: "red", shape: "ring", text: "disconnected"});
            node.scheduleReconnect();
        };
        
        // Schedule reconnection
        this.scheduleReconnect = function() {
            clearTimeout(node.reconnectTimer);
            node.reconnectTimer = setTimeout(function() {
                node.connect();
            }, node.reconnectTimeout);
        };
        
        // Handle input messages
        node.on('input', function(msg) {
            // Allow reconnecting via message
            if (msg.topic === 'reconnect') {
                node.disconnect();
                node.connect();
            }
            
            // Allow changing event types via message
            if (msg.eventTypes) {
                node.eventTypes = msg.eventTypes;
                node.disconnect();
                node.connect();
            }
            
            // Allow changing device ID via message
            if (msg.deviceId) {
                node.deviceId = msg.deviceId;
                node.disconnect();
                node.connect();
            }
            
            // Allow changing additional params via message
            if (msg.additionalParams) {
                node.additionalParams = msg.additionalParams;
                node.disconnect();
                node.connect();
            }
            
            // Allow changing HTTPS setting via message
            if (msg.useHttps !== undefined) {
                node.useHttps = msg.useHttps;
                node.disconnect();
                node.connect();
            }
        });
        
        // Connect on startup
        node.connect();
        
        // Clean up on node removal
        node.on("close", function(done) {
            if (node.eventSource) {
                node.eventSource.close();
                node.eventSource = null;
            }
            clearTimeout(node.reconnectTimer);
            done();
        });
    }
    
    RED.nodes.registerType("mcp-sse", MCPSSENode);
}
