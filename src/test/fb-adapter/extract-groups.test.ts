import { describe, it, expect, beforeEach } from 'vitest';
import { extractGroupsFromPage } from '../../content/fb-adapter/extract-groups';

describe('extractGroupsFromPage', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-pagelet="GroupsYouManageFeedUnit">
        <div role="listitem">
          <a href="/groups/123456789" class="x1i10hfl">
            <div role="heading"><strong>Test Group 1</strong></div>
          </a>
          <span>1,234 members</span>
        </div>
        <div role="listitem">
          <a href="/groups/987654321" class="x1i10hfl">
            <div role="heading"><strong>Test Group 2</strong></div>
          </a>
          <span>5,678 people</span>
        </div>
        <div role="listitem">
          <a href="/groups/111222333" class="x1i10hfl">
            <div role="heading"><strong>Test Group 3</strong></div>
          </a>
          <span>999 members</span>
        </div>
      </div>
    `;
  });

  it('extracts group id from URL', () => {
    const groups = extractGroupsFromPage();
    expect(groups).toHaveLength(3);
    expect(groups[0].id).toBe('123456789');
    expect(groups[1].id).toBe('987654321');
    expect(groups[2].id).toBe('111222333');
  });

  it('extracts group name from heading', () => {
    const groups = extractGroupsFromPage();
    expect(groups[0].name).toBe('Test Group 1');
    expect(groups[1].name).toBe('Test Group 2');
    expect(groups[2].name).toBe('Test Group 3');
  });

  it('extracts group URL', () => {
    const groups = extractGroupsFromPage();
    expect(groups[0].url).toContain('/groups/123456789');
    expect(groups[1].url).toContain('/groups/987654321');
  });

  it('parses member count from text', () => {
    const groups = extractGroupsFromPage();
    expect(groups[0].memberCount).toBe(1234);
    expect(groups[1].memberCount).toBe(5678);
    expect(groups[2].memberCount).toBe(999);
  });

  it('deduplicates groups by id', () => {
    document.body.innerHTML += `
      <div role="listitem">
        <a href="/groups/123456789"><div role="heading"><strong>Duplicate Group</strong></div></a>
      </div>
    `;
    const groups = extractGroupsFromPage();
    const ids = groups.map(g => g.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe('extractGroupsFromPage with different selectors', () => {
  it('works with data-testid group-card', () => {
    document.body.innerHTML = `
      <div data-testid="group-card">
        <a href="/groups/555666777"><div role="heading"><strong>Card Group</strong></div></a>
        <span>100 members</span>
      </div>
    `;
    const groups = extractGroupsFromPage();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Card Group');
  });

  it('works with div[role="article"]', () => {
    document.body.innerHTML = `
      <div role="article">
        <a href="/groups/888999000"><strong>Article Group</strong></a>
        <span>50 people</span>
      </div>
    `;
    const groups = extractGroupsFromPage();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Article Group');
  });

  it('returns empty array for no matching elements', () => {
    document.body.innerHTML = '<div>No groups here</div>';
    const groups = extractGroupsFromPage();
    expect(groups).toHaveLength(0);
  });
});
