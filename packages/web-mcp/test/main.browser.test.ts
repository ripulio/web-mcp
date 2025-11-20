import {describe, it, expect, vi} from 'vitest';
import '../src/main.js';
import {type ToolDefinition, type CallToolResult} from '../src/main.js';

describe('provideContext', () => {
  it('should register tools', async () => {
    const content = {content: [{type: 'text', text: 'Echoed!'}]};
    const execute = vi.fn().mockResolvedValue(content);
    const toolDefinition: ToolDefinition = {
      name: 'echo',
      description: 'Echoes the input',
      inputSchema: {
        type: 'object',
        properties: {
          message: {type: 'string'}
        },
        required: ['message']
      },
      execute
    };

    navigator.modelContext!.registerTool(toolDefinition);

    const result = await navigator.modelContext!.executeTool('echo', {
      message: 'Hello, World!'
    });

    expect(execute).toHaveBeenCalledWith({message: 'Hello, World!'});
    expect(result).toBe(content);
  });

  it('should handle unknown tools gracefully', async () => {
    const result = await navigator.modelContext!.executeTool('unknownTool', {});

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Tool not found: unknownTool'
        }
      ]
    });
  });

  it('should handle tool execution errors', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('Execution failed'));
    const toolDefinition: ToolDefinition = {
      name: 'failingTool',
      description: 'A tool that fails',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      execute
    };

    navigator.modelContext!.registerTool(toolDefinition);

    const result = await navigator.modelContext!.executeTool('failingTool', {});

    expect(execute).toHaveBeenCalled();
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Error executing tool failingTool: Execution failed'
        }
      ]
    });
  });

  it('should respond with tool results', async () => {
    const callResult: CallToolResult = {
      content: [{type: 'text', text: 'Success'}]
    };
    const execute = vi
      .fn<() => Promise<CallToolResult>>()
      .mockResolvedValue(callResult);
    const toolDefinition: ToolDefinition = {
      name: 'successfulTool',
      description: 'A tool that succeeds',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      execute
    };

    navigator.modelContext!.registerTool(toolDefinition);

    const result = await navigator.modelContext!.executeTool(
      'successfulTool',
      {}
    );

    expect(execute).toHaveBeenCalled();
    expect(result).toEqual(callResult);
  });
});
