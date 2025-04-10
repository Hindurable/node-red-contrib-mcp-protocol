module.exports = function(RED) {
    const net = require('net');
    const EventEmitter = require('events');
    
    function MCPConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Create event emitter for handling responses
        this.responseEmitter = new EventEmitter();
        this.requestId = 0;
        
        // Store configuration
        this.host = config.host;
        this.port = config.port;
        this.reconnectTimeout = config.reconnectTimeout || 5000;
        this.connected = false;
        this.connecting = false;
        this.client = null;
        this.inputNodes = [];
        this.outputNodes = [];
        this.reconnectTimer = null;
        this.buffer = Buffer.alloc(0);
        
        // MCP protocol specific settings
        this.mcpVersion = config.mcpVersion || "1.0";
        this.deviceId = config.deviceId || "";
        this.authKey = config.authKey || "";
        
        // Connect to MCP server
        this.connect = function() {
            if (node.connecting || node.connected) return;
            
            node.connecting = true;
            node.connected = false;
            clearTimeout(node.reconnectTimer);
            
            // Update status for all registered nodes
            node.updateNodeStatus({fill: "yellow", shape: "ring", text: "connecting..."});
            
            // Create TCP client
            node.client = net.connect({
                host: node.host,
                port: node.port
            }, function() {
                node.connecting = false;
                node.connected = true;
                node.log("Connected to MCP server at " + node.host + ":" + node.port);
                
                // Send authentication if needed
                if (node.authKey) {
                    const authMsg = {
                        type: "auth",
                        version: node.mcpVersion,
                        deviceId: node.deviceId,
                        key: node.authKey
                    };
                    node.client.write(JSON.stringify(authMsg) + "\n");
                }
                
                // Update status for all registered nodes
                node.updateNodeStatus({fill: "green", shape: "ring", text: "connected"});
            });
            
            // Handle data from MCP server
            node.client.on('data', function(data) {
                // Combine with existing buffer
                node.buffer = Buffer.concat([node.buffer, data]);
                
                // Process complete messages
                node.processBuffer();
            });
            
            // Handle connection errors
            node.client.on('error', function(err) {
                node.error("MCP connection error: " + err.message);
                node.disconnect();
            });
            
            // Handle connection close
            node.client.on('close', function() {
                if (node.connected) {
                    node.log("MCP connection closed");
                    node.disconnect();
                }
            });
        };
        
        // Process the buffer for complete MCP messages
        this.processBuffer = function() {
            // This is a simplified implementation - adjust based on actual MCP protocol
            // Assuming messages are newline-delimited
            let newlineIndex;
            while ((newlineIndex = node.buffer.indexOf('\n')) !== -1) {
                // Extract message
                const message = node.buffer.slice(0, newlineIndex);
                
                // Remove processed message from buffer
                node.buffer = node.buffer.slice(newlineIndex + 1);
                
                try {
                    // Try to parse as JSON
                    const jsonMessage = JSON.parse(message);
                    
                    // Check if this is a response to a request
                    if (jsonMessage.id) {
                        // Emit response event
                        node.responseEmitter.emit('response', jsonMessage);
                    }
                    
                    // Distribute message to all input nodes regardless
                    node.inputNodes.forEach(function(inputNode) {
                        inputNode.processData(message);
                    });
                } catch (e) {
                    // Not JSON or other error, just pass the raw message
                    node.inputNodes.forEach(function(inputNode) {
                        inputNode.processData(message);
                    });
                }
            }
        };
        
        // Disconnect from MCP server
        this.disconnect = function() {
            if (node.client) {
                node.client.destroy();
                node.client = null;
            }
            
            node.connecting = false;
            node.connected = false;
            
            // Update status for all registered nodes
            node.updateNodeStatus({fill: "red", shape: "ring", text: "disconnected"});
            
            // Schedule reconnection
            clearTimeout(node.reconnectTimer);
            node.reconnectTimer = setTimeout(function() {
                node.connect();
            }, node.reconnectTimeout);
        };
        
        // Send data to MCP server
        this.send = function(data) {
            if (!node.connected || !node.client) {
                node.error("Cannot send data: Not connected to MCP server");
                return false;
            }
            
            try {
                // Add newline if string and doesn't already have one
                if (typeof data === "string" && !data.endsWith("\n")) {
                    data += "\n";
                } else if (Buffer.isBuffer(data)) {
                    // Ensure buffer ends with newline
                    const lastByte = data[data.length - 1];
                    if (lastByte !== 10) { // 10 is ASCII for newline
                        data = Buffer.concat([data, Buffer.from("\n")]);
                    }
                }
                
                return node.client.write(data);
            } catch (err) {
                node.error("Error sending data to MCP server: " + err.message);
                return false;
            }
        };
        
        // Update status for all registered nodes
        this.updateNodeStatus = function(status) {
            node.inputNodes.forEach(function(n) {
                n.status(status);
            });
            node.outputNodes.forEach(function(n) {
                n.status(status);
            });
        };
        
        // Register input node
        this.registerInputNode = function(inputNode) {
            node.inputNodes.push(inputNode);
            if (node.connected) {
                inputNode.status({fill: "green", shape: "ring", text: "connected"});
            } else {
                inputNode.status({fill: "red", shape: "ring", text: "disconnected"});
            }
        };
        
        // Register output node
        this.registerOutputNode = function(outputNode) {
            node.outputNodes.push(outputNode);
            if (node.connected) {
                outputNode.status({fill: "green", shape: "ring", text: "connected"});
            } else {
                outputNode.status({fill: "red", shape: "ring", text: "disconnected"});
            }
        };
        
        // Deregister input node
        this.deregisterInputNode = function(inputNode) {
            const index = node.inputNodes.indexOf(inputNode);
            if (index !== -1) {
                node.inputNodes.splice(index, 1);
            }
        };
        
        // Deregister output node
        this.deregisterOutputNode = function(outputNode) {
            const index = node.outputNodes.indexOf(outputNode);
            if (index !== -1) {
                node.outputNodes.splice(index, 1);
            }
        };
        
        // Check connection status
        this.isConnected = function() {
            return node.connected;
        };
        
        // Generic method to call any MCP protocol method
        this.callMethod = function(method, params, callback) {
            if (!node.connected || !node.client) {
                return callback(new Error("Not connected to MCP server"), null);
            }
            
            const requestId = ++node.requestId;
            const request = {
                id: requestId,
                method: method
            };
            
            // Add params if provided
            if (params) {
                request.params = params;
            }
            
            // Set up listener for this specific request
            const responseHandler = function(response) {
                if (response.id === requestId) {
                    // Remove this listener once we get the response
                    node.responseEmitter.removeListener('response', responseHandler);
                    
                    if (response.error) {
                        callback(new Error(typeof response.error === 'object' ? 
                            JSON.stringify(response.error) : response.error), null);
                    } else {
                        callback(null, response.result);
                    }
                }
            };
            
            // Listen for response
            node.responseEmitter.on('response', responseHandler);
            
            // Send request
            node.send(JSON.stringify(request) + "\n");
            
            // Set timeout for response
            setTimeout(function() {
                // Check if listener still exists (response not received)
                if (node.responseEmitter.listenerCount('response') > 0) {
                    node.responseEmitter.removeListener('response', responseHandler);
                    callback(new Error("Request timed out"), null);
                }
            }, 10000); // 10 second timeout
        };
        
        // List available tools via MCP protocol
        this.listTools = function(callback) {
            return node.callMethod("tools/list", null, callback);
        };
        
        // List available devices via MCP protocol
        this.listDevices = function(callback) {
            return node.callMethod("devices/list", null, callback);
        };
        
        // Get device status via MCP protocol
        this.getDeviceStatus = function(deviceId, callback) {
            return node.callMethod("devices/status", { deviceId: deviceId }, callback);
        };
        
        // Execute command on device via MCP protocol
        this.executeCommand = function(deviceId, command, params, callback) {
            return node.callMethod("devices/execute", {
                deviceId: deviceId,
                command: command,
                params: params
            }, callback);
        };
        
        // Connect on startup
        this.connect();
        
        // Clean up on node removal
        node.on("close", function(done) {
            clearTimeout(node.reconnectTimer);
            if (node.client) {
                node.client.destroy();
                node.client = null;
            }
            node.connected = false;
            node.connecting = false;
            done();
        });
    }
    
    RED.nodes.registerType("mcp-config", MCPConfigNode);
}
