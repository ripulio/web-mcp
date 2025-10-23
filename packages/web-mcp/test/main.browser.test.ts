import {describe, it, expect, vi} from 'vitest';
import '../src/main.js';
import {
  type ToolDefinition,
  ToolCallEvent,
  type CallToolResult
} from '../src/main.js';

describe('provideContext', () => {
  it('should register tools', async () => {
    const execute = vi.fn();
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

    window.agent.tools.define(toolDefinition);

    const toolCallEvent = new ToolCallEvent(
      'echo',
      {message: 'Hello, World!'},
      () => {
        return;
      }
    );

    window.dispatchEvent(toolCallEvent);

    expect(execute).toHaveBeenCalledWith({message: 'Hello, World!'});
  });

  it('should handle unknown tools gracefully', () => {
    const respondWith = vi.fn();
    const toolCallEvent = new ToolCallEvent('unknownTool', {}, respondWith);

    expect(() => {
      window.dispatchEvent(toolCallEvent);
    }).not.toThrow();
    expect(respondWith).toHaveBeenCalledWith({
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

    window.agent.tools.define(toolDefinition);

    const respondWith = vi.fn().mockImplementation(() => {
      return;
    });
    const toolCallEvent = new ToolCallEvent('failingTool', {}, respondWith);

    expect(() => {
      window.dispatchEvent(toolCallEvent);
    }).not.toThrow();

    // TODO(jg): wait for the respondWith call instead
    await Promise.resolve();

    expect(execute).toHaveBeenCalled();
    expect(respondWith).toHaveBeenCalledWith({
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
    const result: CallToolResult = {
      content: [{type: 'text', text: 'Success'}]
    };
    const execute = vi
      .fn<() => Promise<CallToolResult>>()
      .mockResolvedValue(result);
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

    window.agent.tools.define(toolDefinition);

    const respondWith = vi.fn();
    const toolCallEvent = new ToolCallEvent('successfulTool', {}, respondWith);

    window.dispatchEvent(toolCallEvent);

    // TODO(jg): wait for the respondWith call instead
    await Promise.resolve();

    expect(execute).toHaveBeenCalled();
    expect(respondWith).toHaveBeenCalledWith(result);
  });
});
