import { describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { EditorToolbar, PropertyPanel } from '../features/editor';
import { AppSectionHeader } from '../features/apps/app-section-header';

const samplePages: PagesJson = {
  pages: [
    {
      path: 'home',
      title: 'Home',
      body: [
        { type: 'text', id: 'hero-title', text: 'Hello' },
        {
          type: 'form',
          id: 'profile-form',
          fields: [
            { name: 'email', label: 'Email', type: 'text', required: true },
          ],
        },
      ],
    },
  ],
};

describe('Editor chrome rendering', () => {
  test('toolbar shows dirty state copy and save action', () => {
    const html = renderToStaticMarkup(
      <EditorToolbar
        dirty
        submitting={false}
        canUndo
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onSave={() => {}}
        pagePanelOpen
        onTogglePagePanel={() => {}}
        propertyPanelOpen={false}
        onTogglePropertyPanel={() => {}}
      />,
    );

    expect(html).toContain('有未保存修改');
    expect(html).toContain('保存');
    expect(html).toContain('页面和组件');
    expect(html).toContain('属性面板');
  });

  test('property panel renders selected node identity fields', () => {
    const html = renderToStaticMarkup(
      <PropertyPanel
        draftJson={samplePages}
        currentPagePath="home"
        selectedNodeId="hero-title"
        selectedColumnKey={null}
        selectedFieldKey={null}
        onChange={() => {}}
        onColumnChange={() => {}}
        onFieldChange={() => {}}
      />,
    );

    expect(html).toContain('当前节点:');
    expect(html).toContain('text');
    expect(html).toContain('hero-title');
  });

  test('property panel renders empty guidance without selection', () => {
    const html = renderToStaticMarkup(
      <PropertyPanel
        draftJson={samplePages}
        currentPagePath="home"
        selectedNodeId={null}
        selectedColumnKey={null}
        selectedFieldKey={null}
        onChange={() => {}}
        onColumnChange={() => {}}
        onFieldChange={() => {}}
      />,
    );

    expect(html).toContain('当前页面:');
    expect(html).toContain('Home');
  });

  test('property panel renders selected form field editor', () => {
    const html = renderToStaticMarkup(
      <PropertyPanel
        draftJson={samplePages}
        currentPagePath="home"
        selectedNodeId={null}
        selectedColumnKey={null}
        selectedFieldKey={{ formId: 'profile-form', fieldIndex: 0 }}
        onChange={() => {}}
        onColumnChange={() => {}}
        onFieldChange={() => {}}
      />,
    );

    expect(html).toContain('当前字段:');
    expect(html).toContain('Email');
    expect(html).toContain('字段属性');
  });

  test('app section header renders title addon beside the app title', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AppSectionHeader
          mode="draft"
          appName="myapp"
          appDisplayName="My App"
          appHomeTo="/draft/apps/myapp/home"
          stableStatus="running"
          toggleSidebar={() => {}}
          sidebarVisible
          titleAddon={<button type="button" aria-label="修改显示名称">edit</button>}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('My App');
    expect(html).toContain('aria-label="修改显示名称"');
  });

  test('app section header renders action slot for console entry', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AppSectionHeader
          mode="stable"
          appName="myapp"
          appDisplayName="My App"
          appHomeTo="/stable/apps/myapp/home"
          stableStatus="running"
          toggleSidebar={() => {}}
          sidebarVisible
          actions={<a href="/stable/apps/myapp/console">控制台</a>}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('控制台');
    expect(html).toContain('/stable/apps/myapp/console');
  });
});
