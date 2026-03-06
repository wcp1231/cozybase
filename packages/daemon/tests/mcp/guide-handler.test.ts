import { describe, expect, test } from 'bun:test';
import {
  handleGetGuide,
  stripMarkdownHtmlComments,
} from '../../src/mcp/guide-handler';

describe('stripMarkdownHtmlComments', () => {
  test('removes html comments outside fenced code blocks', () => {
    const input = [
      '# Title',
      '',
      '<!-- hidden -->',
      'Visible text',
      'Inline <!-- hidden --> text',
      '',
      '```md',
      '<!-- keep inside code fence -->',
      '```',
    ].join('\n');

    expect(stripMarkdownHtmlComments(input)).toBe([
      '# Title',
      '',
      '',
      'Visible text',
      'Inline  text',
      '',
      '```md',
      '<!-- keep inside code fence -->',
      '```',
    ].join('\n'));
  });

  test('removes multiline html comments outside fenced code blocks', () => {
    const input = [
      'Before',
      '<!-- start',
      'still hidden',
      'end -->',
      'After',
    ].join('\n');

    expect(stripMarkdownHtmlComments(input)).toBe([
      'Before',
      '',
      '',
      '',
      'After',
    ].join('\n'));
  });
});

describe('handleGetGuide', () => {
  test('hides auto-generated html comments from guide output', () => {
    const content = handleGetGuide('ui/components/button');

    expect(content).toContain('# Button');
    expect(content).not.toContain('<!-- AUTO-GENERATED-PROPS:START -->');
    expect(content).not.toContain('<!-- AUTO-GENERATED-PROPS:END -->');
  });

  test('loads newly added guide topics', () => {
    const uiBatch = handleGetGuide('ui/batch');
    const schedules = handleGetGuide('scheduled-tasks');

    expect(uiBatch).toContain('# ui_batch');
    expect(uiBatch).toContain('Refs are always resolved in operation-level fields');
    expect(schedules).toContain('# Scheduled Tasks');
    expect(schedules).toContain('Manual Trigger Endpoints');
  });
});
