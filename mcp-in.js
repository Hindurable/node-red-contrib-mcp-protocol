module.exports = function(RED) {
    function MCPInNode(config) {
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
        this.topic = config.topic || "mcp";
        this.dataType = config.dataType || "auto";
        
        // Handle incoming MCP messages
        mcpConfig.registerInputNode(node);
        
        // Process received data
        this.processData = function(data) {
            try {
                let payload;
                
                // Convert data according to specified type
                switch (node.dataType) {
                    case "string":
                        payload = data.toString();
                        break;
                    case "buffer":
                        payload = Buffer.from(data);
                        break;
                    case "json":
                        payload = JSON.parse(data.toString());
                        break;
                    case "auto":
                    default:
                        try {
                            payload = JSON.parse(data.toString());
                        } catch (e) {
                            payload = data.toString();
                        }
                }
                
                // Send message to next node
                node.send({
                    topic: node.topic,
                    payload: payload,
                    mcp: {
                        raw: data
                    }
                });
            } catch (error) {
                node.error("Error processing MCP data: " + error.message);
                node.status({fill: "red", shape: "dot", text: "error"});
            }
        };
        
        // Clean up on node removal
        node.on("close", function(done) {
            if (mcpConfig) {
                mcpConfig.deregisterInputNode(node);
            }
            done();
        });
    }
    
    RED.nodes.registerType("mcp-in", MCPInNode);
}
