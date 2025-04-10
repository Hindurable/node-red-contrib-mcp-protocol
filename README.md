# Node-RED MCP Protocol Component

A Node-RED component for communicating with devices using the MCP protocol.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Receive data from MCP protocol servers
- Send data to MCP protocol servers
- Configurable data formats (string, JSON, buffer)
- Automatic reconnection on connection loss
- Support for authentication

## Installation

### Local Installation

To install the node in your Node-RED installation:

```bash
cd ~/.node-red
npm install /path/to/node-red-contrib-mcp-protocol
```

### Global Installation

To install the node globally:

```bash
npm install -g /path/to/node-red-contrib-mcp-protocol
```

## Usage

### Configuration

1. Add an MCP configuration node
2. Configure the host and port for your MCP server
3. Optionally set the device ID and authentication key if required by your MCP server

### Receiving Data

1. Add an "MCP In" node to your flow
2. Configure it to use your MCP configuration
3. Select the output format (Auto-detect, String, Buffer, or JSON)
4. Connect the output to other nodes in your flow

### Sending Data

1. Add an "MCP Out" node to your flow
2. Configure it to use your MCP configuration
3. Select the input format (Auto-convert, String, Buffer, or JSON)
4. Connect other nodes to the input of the MCP Out node

## Example Flow

```json
[
    {
        "id": "f6f2187d.f17ca8",
        "type": "mcp-in",
        "z": "2b9467.5f69d7cc",
        "name": "MCP Receiver",
        "server": "3fa97a8a.3b9946",
        "topic": "mcp/data",
        "dataType": "json",
        "x": 270,
        "y": 180,
        "wires": [
            [
                "25f5d5dd.2d836a"
            ]
        ]
    },
    {
        "id": "25f5d5dd.2d836a",
        "type": "debug",
        "z": "2b9467.5f69d7cc",
        "name": "MCP Data",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "x": 460,
        "y": 180,
        "wires": []
    },
    {
        "id": "3fa97a8a.3b9946",
        "type": "mcp-config",
        "name": "MCP Server",
        "host": "192.168.1.100",
        "port": "1234",
        "reconnectTimeout": "5000",
        "mcpVersion": "1.0",
        "deviceId": "node-red-client",
        "authKey": ""
    }
]
```

## Customizing the MCP Protocol

The current implementation uses a simplified version of the MCP protocol with newline-delimited messages. To customize for your specific MCP protocol implementation:

1. Modify the `processBuffer` method in `mcp-config.js` to match your protocol's message format
2. Adjust the authentication mechanism in the `connect` method if needed
3. Update the data processing in `mcp-in.js` and `mcp-out.js` to handle your specific data formats

## License

MIT
