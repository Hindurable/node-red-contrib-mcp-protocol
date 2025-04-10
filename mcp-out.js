module.exports = function(RED) {
    function MCPOutNode(config) {
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
        this.dataType = config.dataType || "auto";
        
        // Register with the config node
        mcpConfig.registerOutputNode(node);
        
        // Handle incoming messages from Node-RED flow
        node.on("input", function(msg) {
            if (!mcpConfig.isConnected()) {
                node.status({fill: "red", shape: "ring", text: "disconnected"});
                node.error("Not connected to MCP server");
                return;
            }
            
            // Handle special MCP protocol method requests
            if (msg.topic && (msg.topic.startsWith('tools/') || msg.topic.startsWith('devices/')) || 
                (msg.payload && msg.payload.method && (msg.payload.method.startsWith('tools/') || msg.payload.method.startsWith('devices/')))) {
                
                const method = msg.payload && msg.payload.method ? msg.payload.method : msg.topic;
                const params = msg.payload && msg.payload.params ? msg.payload.params : 
                              (msg.payload && typeof msg.payload === 'object' && !msg.payload.method ? msg.payload : null);
                
                node.status({fill: "blue", shape: "dot", text: "calling " + method});
                
                // Special case handling for common methods
                if (method === 'tools/list') {
                    mcpConfig.listTools(handleResponse(method));
                    return;
                } else if (method === 'devices/list') {
                    mcpConfig.listDevices(handleResponse(method));
                    return;
                } else if (method === 'devices/status' && params && params.deviceId) {
                    mcpConfig.getDeviceStatus(params.deviceId, handleResponse(method));
                    return;
                } else if (method === 'devices/execute' && params && params.deviceId && params.command) {
                    mcpConfig.executeCommand(params.deviceId, params.command, params.params, handleResponse(method));
                    return;
                }
                
                // Generic method handling
                mcpConfig.callMethod(method, params, handleResponse(method));
                return;
            }
            
            // Helper function to handle method responses
            function handleResponse(method) {
                return function(err, result) {
                    if (err) {
                        node.error("Error calling " + method + ": " + err.message);
                        node.status({fill: "red", shape: "dot", text: "error"});
                        node.send({
                            topic: method,
                            payload: { error: err.message }
                        });
                    } else {
                        node.status({fill: "green", shape: "dot", text: method + " success"});
                        node.send({
                            topic: method,
                            payload: result
                        });
                    }
                };
            }
            
            try {
                let data = msg.payload;
                
                // Convert data according to specified type
                switch (node.dataType) {
                    case "string":
                        if (typeof data !== "string") {
                            data = JSON.stringify(data);
                        }
                        break;
                    case "buffer":
                        if (!Buffer.isBuffer(data)) {
                            data = Buffer.from(typeof data === "object" ? JSON.stringify(data) : data.toString());
                        }
                        break;
                    case "json":
                        if (typeof data !== "string") {
                            data = JSON.stringify(data);
                        }
                        break;
                    case "auto":
                    default:
                        if (typeof data === "object" && !Buffer.isBuffer(data)) {
                            data = JSON.stringify(data);
                        } else if (typeof data !== "string" && !Buffer.isBuffer(data)) {
                            data = data.toString();
                        }
                }
                
                // Send data to MCP server
                mcpConfig.send(data);
                node.status({fill: "green", shape: "dot", text: "sent"});
                
                // Reset status after a short delay
                setTimeout(function() {
                    if (mcpConfig.isConnected()) {
                        node.status({fill: "green", shape: "ring", text: "connected"});
                    }
                }, 1000);
                
            } catch (error) {
                node.error("Error sending MCP data: " + error.message);
                node.status({fill: "red", shape: "dot", text: "error"});
            }
        });
        
        // Clean up on node removal
        node.on("close", function(done) {
            if (mcpConfig) {
                mcpConfig.deregisterOutputNode(node);
            }
            done();
        });
    }
    
    RED.nodes.registerType("mcp-out", MCPOutNode);
}
