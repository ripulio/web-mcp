import {describe, it, expect} from 'vitest';
import {getTools} from '../src/tools.js';

describe('getTools', () => {
  it('should return array of tools', () => {
    const tools = getTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('executeTool');
  });
});
