import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Search,
  Save,
  Download,
  Upload,
  Settings,
  Image,
  FileText,
  List,
} from 'lucide-react';
import { DEFAULT_USER_SETTINGS } from '../shared/types';
import type { Group, GroupList, Template, ImageSet, UserSettings } from '../shared/types';
import {
  sanitizeGroupList,
  sanitizeTemplate,
  sanitizeImageSet,
  sanitizeCaption,
  sanitizeComment,
  sanitizeGroupName,
  sanitizeTemplateName,
  sanitizeImageSetName,
} from '../shared/security';

const COLORS = [
  '#1877f2',
  '#42b72a',
  '#e63946',
  '#f77f00',
  '#9b59b6',
  '#00b4d8',
  '#e85d75',
  '#2ec4b6',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectionValues(value: unknown): unknown[] {
  return isRecord(value) ? Object.values(value) : [];
}

function normalizeGroups(value: unknown): Group[] {
  return collectionValues(value).flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      return [];
    }

    return [
      {
        id: item.id,
        name: item.name,
        url: typeof item.url === 'string' ? item.url : '',
        memberCount: typeof item.memberCount === 'number' ? item.memberCount : undefined,
        isAdmin: typeof item.isAdmin === 'boolean' ? item.isAdmin : undefined,
        category: typeof item.category === 'string' ? item.category : undefined,
        addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
        lastPostedAt: typeof item.lastPostedAt === 'number' ? item.lastPostedAt : undefined,
      },
    ];
  });
}

function normalizeGroupLists(value: unknown): GroupList[] {
  return collectionValues(value).flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      return [];
    }

    return [
      {
        id: item.id,
        name: item.name,
        groupIds: Array.isArray(item.groupIds)
          ? item.groupIds.filter((id): id is string => typeof id === 'string')
          : [],
        color:
          typeof item.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(item.color)
            ? item.color
            : COLORS[0],
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      },
    ];
  });
}

function normalizeTemplates(value: unknown): Template[] {
  return collectionValues(value).flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      return [];
    }

    return [
      {
        id: item.id,
        name: item.name,
        caption: typeof item.caption === 'string' ? item.caption : '',
        firstComment: typeof item.firstComment === 'string' ? item.firstComment : undefined,
        settings: isRecord(item.settings) ? (item.settings as Template['settings']) : {},
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      },
    ];
  });
}

function normalizeImageSets(value: unknown): ImageSet[] {
  return collectionValues(value).flatMap(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      return [];
    }

    return [
      {
        id: item.id,
        name: item.name,
        imageUrls: Array.isArray(item.imageUrls)
          ? item.imageUrls.filter((url): url is string => typeof url === 'string')
          : [],
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      },
    ];
  });
}

function normalizeUserSettings(value: unknown): UserSettings {
  const settings = isRecord(value) ? value : {};
  return {
    theme:
      settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system'
        ? settings.theme
        : DEFAULT_USER_SETTINGS.theme,
    language:
      typeof settings.language === 'string' ? settings.language : DEFAULT_USER_SETTINGS.language,
    showShareButton:
      typeof settings.showShareButton === 'boolean'
        ? settings.showShareButton
        : DEFAULT_USER_SETTINGS.showShareButton,
    shareButtonPosition:
      settings.shareButtonPosition === 'before_share' ||
      settings.shareButtonPosition === 'floating' ||
      settings.shareButtonPosition === 'after_share'
        ? settings.shareButtonPosition
        : DEFAULT_USER_SETTINGS.shareButtonPosition,
    autoDetectGroups:
      typeof settings.autoDetectGroups === 'boolean'
        ? settings.autoDetectGroups
        : DEFAULT_USER_SETTINGS.autoDetectGroups,
    confirmBeforeShare:
      typeof settings.confirmBeforeShare === 'boolean'
        ? settings.confirmBeforeShare
        : DEFAULT_USER_SETTINGS.confirmBeforeShare,
    soundNotifications:
      typeof settings.soundNotifications === 'boolean'
        ? settings.soundNotifications
        : DEFAULT_USER_SETTINGS.soundNotifications,
    desktopNotifications:
      typeof settings.desktopNotifications === 'boolean'
        ? settings.desktopNotifications
        : DEFAULT_USER_SETTINGS.desktopNotifications,
    analyticsOptIn:
      typeof settings.analyticsOptIn === 'boolean'
        ? settings.analyticsOptIn
        : DEFAULT_USER_SETTINGS.analyticsOptIn,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState<
    'groups' | 'lists' | 'templates' | 'images' | 'settings'
  >('lists');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupLists, setGroupLists] = useState<GroupList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [imageSets, setImageSets] = useState<ImageSet[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    theme: 'system',
    language: 'en',
    showShareButton: true,
    shareButtonPosition: 'after_share',
    autoDetectGroups: true,
    confirmBeforeShare: true,
    soundNotifications: true,
    desktopNotifications: true,
    analyticsOptIn: false,
  });

  const [editingList, setEditingList] = useState<GroupList | undefined>(undefined);
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>(undefined);
  const [editingImageSet, setEditingImageSet] = useState<ImageSet | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      const [groupsData, listsData, templatesData, imagesData, settingsData] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_ALL_GROUPS' }),
        chrome.runtime.sendMessage({ type: 'GET_GROUP_LISTS' }),
        chrome.runtime.sendMessage({ type: 'GET_TEMPLATES' }),
        chrome.runtime.sendMessage({ type: 'GET_IMAGE_SETS' }),
        chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }),
      ]);
      setGroups(normalizeGroups(groupsData));
      setGroupLists(normalizeGroupLists(listsData));
      setTemplates(normalizeTemplates(templatesData));
      setImageSets(normalizeImageSets(imagesData));
      setUserSettings(normalizeUserSettings(settingsData));
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  async function saveGroupList(list: GroupList) {
    const sanitized = sanitizeGroupList(list);
    await chrome.runtime.sendMessage({ type: 'SAVE_GROUP_LIST', list: sanitized });
    loadAllData();
    setEditingList(undefined);
  }

  async function deleteGroupList(id: string) {
    if (confirm('Delete this group list?')) {
      await chrome.runtime.sendMessage({ type: 'DELETE_GROUP_LIST', id });
      loadAllData();
    }
  }

  async function saveTemplate(template: Template) {
    const sanitized = sanitizeTemplate(template);
    await chrome.runtime.sendMessage({ type: 'SAVE_TEMPLATE', template: sanitized });
    loadAllData();
    setEditingTemplate(undefined);
  }

  async function deleteTemplate(id: string) {
    if (confirm('Delete this template?')) {
      await chrome.runtime.sendMessage({ type: 'DELETE_TEMPLATE', id });
      loadAllData();
    }
  }

  async function saveImageSet(imageSet: ImageSet) {
    const sanitized = sanitizeImageSet(imageSet);
    await chrome.runtime.sendMessage({ type: 'SAVE_IMAGE_SET', imageSet: sanitized });
    loadAllData();
    setEditingImageSet(undefined);
  }

  async function deleteImageSet(id: string) {
    if (confirm('Delete this image set?')) {
      await chrome.runtime.sendMessage({ type: 'DELETE_IMAGE_SET', id });
      loadAllData();
    }
  }

  async function syncGroupsFromFacebook() {
    setSyncing(true);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'SYNC_GROUPS' });
      if (result.success && result.groups) {
        alert(`Found ${result.groups.length} groups!`);
        loadAllData();
      } else {
        alert("Failed to sync groups. Make sure you're on Facebook.");
      }
    } catch (error) {
      alert('Sync failed: ' + error);
    }
    setSyncing(false);
  }

  async function exportData() {
    const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
    if (data) {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fgp-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function importData(file: File) {
    try {
      const text = await file.text();
      const result = await chrome.runtime.sendMessage({ type: 'IMPORT_DATA', data: text });
      if (!result?.success) {
        alert(result?.error || 'Import failed. Please select a valid Free Group Poster backup.');
        return;
      }

      alert('Data imported successfully!');
      await loadAllData();
    } catch (error) {
      console.error('Failed to import data:', error);
      alert('Import failed. Please check that the selected backup is valid.');
    }
  }

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(normalizedSearchQuery)
  );
  const filteredLists = groupLists.filter(list =>
    list.name.toLowerCase().includes(normalizedSearchQuery)
  );

  return (
    <div className="fgp-options">
      <header className="fgp-header">
        <div className="fgp-header-left">
          <Users className="fgp-logo-icon" size={28} />
          <h1>Free Group Poster</h1>
          <span className="fgp-badge">Options</span>
        </div>
        <div className="fgp-header-right">
          <button className="fgp-header-btn" onClick={exportData} title="Export Data">
            <Download size={20} />
          </button>
          <button
            className="fgp-header-btn"
            onClick={() => document.getElementById('import-file')?.click()}
            title="Import Data"
          >
            <Upload size={20} />
          </button>
          <input
            type="file"
            id="import-file"
            accept=".json"
            hidden
            onChange={e => e.target.files?.[0] && importData(e.target.files[0])}
          />
        </div>
      </header>

      <nav className="fgp-nav">
        <button
          className={activeTab === 'lists' ? 'active' : ''}
          onClick={() => setActiveTab('lists')}
        >
          <List size={20} /> Lists
        </button>
        <button
          className={activeTab === 'groups' ? 'active' : ''}
          onClick={() => setActiveTab('groups')}
        >
          <Users size={20} /> Groups
        </button>
        <button
          className={activeTab === 'templates' ? 'active' : ''}
          onClick={() => setActiveTab('templates')}
        >
          <FileText size={20} /> Templates
        </button>
        <button
          className={activeTab === 'images' ? 'active' : ''}
          onClick={() => setActiveTab('images')}
        >
          <Image size={20} /> Images
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={20} /> Settings
        </button>
      </nav>

      <main className="fgp-main">
        {activeTab === 'lists' && (
          <ListsTab
            lists={filteredLists}
            groups={groups}
            editingList={editingList}
            setEditingList={setEditingList}
            onSave={saveGroupList}
            onDelete={deleteGroupList}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        )}
        {activeTab === 'groups' && (
          <GroupsTab
            groups={filteredGroups}
            groupLists={groupLists}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            syncing={syncing}
            onSync={syncGroupsFromFacebook}
          />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab
            templates={templates}
            editingTemplate={editingTemplate}
            setEditingTemplate={setEditingTemplate}
            onSave={saveTemplate}
            onDelete={deleteTemplate}
          />
        )}
        {activeTab === 'images' && (
          <ImagesTab
            imageSets={imageSets}
            editingImageSet={editingImageSet}
            setEditingImageSet={setEditingImageSet}
            onSave={saveImageSet}
            onDelete={deleteImageSet}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab settings={userSettings} setSettings={setUserSettings} />
        )}
      </main>
    </div>
  );
}

interface ListsTabProps {
  lists: GroupList[];
  groups: Group[];
  editingList: GroupList | undefined;
  setEditingList: (list: GroupList | undefined) => void;
  onSave: (list: GroupList) => void;
  onDelete: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

function ListsTab({
  lists,
  groups,
  editingList,
  setEditingList,
  onSave,
  onDelete,
  searchQuery,
  setSearchQuery,
}: ListsTabProps) {
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState<string>(COLORS[0]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const list: GroupList = {
      id: editingList?.id || `list_${Date.now()}`,
      name: newListName.trim(),
      groupIds: selectedGroupIds,
      color: newListColor,
      createdAt: editingList?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    onSave(list);
    setNewListName('');
    setSelectedGroupIds([]);
  };

  return (
    <div className="fgp-tab-panel">
      <div className="fgp-panel-header">
        <h2>Group Lists</h2>
        <button
          className="fgp-btn fgp-btn-primary"
          onClick={() =>
            setEditingList({
              id: `list_${Date.now()}`,
              name: '',
              groupIds: [],
              color: COLORS[0],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
        >
          <Plus size={18} /> New List
        </button>
      </div>

      {editingList ? (
        <ListForm
          list={editingList}
          groups={groups}
          selectedGroupIds={selectedGroupIds}
          setSelectedGroupIds={setSelectedGroupIds}
          newListName={newListName}
          setNewListName={setNewListName}
          newListColor={newListColor}
          setNewListColor={setNewListColor}
          onSubmit={handleSubmit}
          onCancel={() => {
            setEditingList(undefined);
            setNewListName('');
            setSelectedGroupIds([]);
          }}
        />
      ) : (
        <>
          <div className="fgp-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search lists..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="fgp-list-grid">
            {lists.map(list => (
              <ListCard
                key={list.id}
                list={list}
                groups={groups}
                onEdit={setEditingList}
                onDelete={onDelete}
              />
            ))}
            {lists.length === 0 && (
              <div className="fgp-empty-state">
                <List size={48} />
                <p>No lists yet</p>
                <button
                  className="fgp-btn fgp-btn-primary"
                  onClick={() => setEditingList(undefined)}
                >
                  Create your first list
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface ListCardProps {
  list: GroupList;
  groups: Group[];
  onEdit: (list: GroupList) => void;
  onDelete: (id: string) => void;
}

function ListCard({ list, groups, onEdit, onDelete }: ListCardProps) {
  const listGroups = list.groupIds
    .map(id => groups.find(g => g.id === id))
    .filter((g): g is Group => !!g);
  return (
    <div className="fgp-list-card" style={{ borderColor: list.color }}>
      <div className="fgp-list-header" style={{ background: list.color }}>
        <h3>{list.name}</h3>
        <span>{list.groupIds.length} groups</span>
      </div>
      <div className="fgp-list-groups">
        {listGroups.slice(0, 5).map(g => (
          <span key={g.id} className="fgp-group-tag">
            {g.name}
          </span>
        ))}
        {listGroups.length > 5 && (
          <span className="fgp-group-tag">+{listGroups.length - 5} more</span>
        )}
      </div>
      <div className="fgp-list-actions">
        <button className="fgp-btn-icon" onClick={() => onEdit(list)} title="Edit">
          <Edit size={16} />
        </button>
        <button className="fgp-btn-icon" onClick={() => onDelete(list.id)} title="Delete">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

interface ListFormProps {
  list: GroupList;
  groups: Group[];
  selectedGroupIds: string[];
  setSelectedGroupIds: (ids: string[]) => void;
  newListName: string;
  setNewListName: (name: string) => void;
  newListColor: string;
  setNewListColor: (color: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function ListForm({
  list,
  groups,
  selectedGroupIds,
  setSelectedGroupIds,
  newListName,
  setNewListName,
  newListColor,
  setNewListColor,
  onSubmit,
  onCancel,
}: ListFormProps) {
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewListName(sanitizeGroupName(e.target.value));
  };

  return (
    <form className="fgp-form" onSubmit={onSubmit}>
      <div className="fgp-form-row">
        <label>List Name</label>
        <input
          type="text"
          value={newListName}
          onChange={handleNameChange}
          placeholder="My Group List"
          required
        />
      </div>
      <div className="fgp-form-row">
        <label>Color</label>
        <div className="fgp-color-picker">
          {COLORS.map(color => (
            <button
              key={color}
              type="button"
              className={`fgp-color-option ${newListColor === color ? 'selected' : ''}`}
              style={{ background: color }}
              onClick={() => setNewListColor(color)}
            />
          ))}
        </div>
      </div>
      <div className="fgp-form-row">
        <label>Groups ({selectedGroupIds.length} selected)</label>
        <div className="fgp-group-multi-select">
          {groups.map(group => (
            <label key={group.id} className="fgp-checkbox-label">
              <input
                type="checkbox"
                checked={selectedGroupIds.includes(group.id)}
                onChange={e =>
                  setSelectedGroupIds(
                    e.target.checked
                      ? [...selectedGroupIds, group.id]
                      : selectedGroupIds.filter(id => id !== group.id)
                  )
                }
              />
              <span>{group.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="fgp-form-actions">
        <button type="button" className="fgp-btn fgp-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="fgp-btn fgp-btn-primary">
          <Save size={18} /> {list.id.startsWith('list_') ? 'Create' : 'Update'}
        </button>
      </div>
    </form>
  );
}

interface GroupsTabProps {
  groups: Group[];
  groupLists: GroupList[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  syncing: boolean;
  onSync: () => void;
}

function GroupsTab({
  groups,
  groupLists,
  searchQuery,
  setSearchQuery,
  syncing,
  onSync,
}: GroupsTabProps) {
  return (
    <div className="fgp-tab-panel">
      <div className="fgp-panel-header">
        <h2>Groups</h2>
        <button className="fgp-btn fgp-btn-primary" onClick={onSync} disabled={syncing}>
          {syncing ? (
            <>
              <div className="fgp-spinner" /> Syncing...
            </>
          ) : (
            <>
              <Users size={18} /> Sync from Facebook
            </>
          )}
        </button>
      </div>
      <p className="fgp-hint">
        Open Facebook in another tab, go to your Groups page, then click Sync to import your groups.
      </p>
      <div className="fgp-search">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search groups..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="fgp-group-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Members</th>
              <th>Lists</th>
              <th>Last Posted</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <tr key={group.id}>
                <td>
                  <a href={group.url} target="_blank" rel="noopener">
                    {group.name}
                  </a>
                </td>
                <td>{group.memberCount ? group.memberCount.toLocaleString() : '—'}</td>
                <td>
                  {groupLists
                    .filter(l => l.groupIds.includes(group.id))
                    .map(l => (
                      <span
                        key={l.id}
                        className="fgp-group-tag"
                        style={{ background: l.color + '20', color: l.color }}
                      >
                        {l.name}
                      </span>
                    ))}
                </td>
                <td>
                  {group.lastPostedAt ? new Date(group.lastPostedAt).toLocaleDateString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && (
          <div className="fgp-empty-state">
            <Users size={48} />
            <p>No groups yet</p>
            <button className="fgp-btn fgp-btn-primary" onClick={onSync} disabled={syncing}>
              Sync from Facebook
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface TemplatesTabProps {
  templates: Template[];
  editingTemplate: Template | undefined;
  setEditingTemplate: (template: Template | undefined) => void;
  onSave: (template: Template) => void;
  onDelete: (id: string) => void;
}

function TemplatesTab({
  templates,
  editingTemplate,
  setEditingTemplate,
  onSave,
  onDelete,
}: TemplatesTabProps) {
  const [formData, setFormData] = useState({
    name: '',
    caption: '',
    firstComment: '',
    mode: 'share_original' as 'share_original' | 'repost_content',
  });

  useEffect(() => {
    if (editingTemplate) {
      setFormData({
        name: editingTemplate.name,
        caption: editingTemplate.caption,
        firstComment: editingTemplate.firstComment || '',
        mode: editingTemplate.settings.mode || 'share_original',
      });
    } else {
      setFormData({ name: '', caption: '', firstComment: '', mode: 'share_original' });
    }
  }, [editingTemplate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sanitizeTemplateName(formData.name);
    if (!name.trim()) return;
    const template: Template = {
      id: editingTemplate?.id || `template_${Date.now()}`,
      name,
      caption: sanitizeCaption(formData.caption),
      firstComment: sanitizeComment(formData.firstComment),
      settings: { mode: formData.mode },
      createdAt: editingTemplate?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    onSave(template);
    setFormData({ name: '', caption: '', firstComment: '', mode: 'share_original' });
  };

  return (
    <div className="fgp-tab-panel">
      <div className="fgp-panel-header">
        <h2>Post Templates</h2>
        <button
          className="fgp-btn fgp-btn-primary"
          onClick={() =>
            setEditingTemplate({
              id: `template_${Date.now()}`,
              name: '',
              caption: '',
              firstComment: '',
              settings: { mode: 'share_original' },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
        >
          <Plus size={18} /> New Template
        </button>
      </div>

      {editingTemplate !== undefined && (
        <form className="fgp-form" onSubmit={handleSubmit}>
          <div className="fgp-form-row">
            <label>Template Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e =>
                setFormData({ ...formData, name: sanitizeTemplateName(e.target.value) })
              }
              placeholder="My Template"
              required
            />
          </div>
          <div className="fgp-form-row">
            <label>Share Mode</label>
            <select
              value={formData.mode}
              onChange={e => setFormData({ ...formData, mode: e.target.value as any })}
            >
              <option value="share_original">Share the post (keeps author)</option>
              <option value="repost_content">Post as me (new post)</option>
            </select>
          </div>
          <div className="fgp-form-row">
            <label>Caption</label>
            <textarea
              value={formData.caption}
              onChange={e => setFormData({ ...formData, caption: sanitizeCaption(e.target.value) })}
              rows={4}
              placeholder="Your caption... Use {option1|option2} for Spintax"
            />
          </div>
          <div className="fgp-form-row">
            <label>First Comment (optional)</label>
            <textarea
              value={formData.firstComment}
              onChange={e =>
                setFormData({ ...formData, firstComment: sanitizeComment(e.target.value) })
              }
              rows={2}
              placeholder="First comment to auto-post"
            />
          </div>
          <div className="fgp-form-actions">
            <button
              type="button"
              className="fgp-btn fgp-btn-secondary"
              onClick={() => setEditingTemplate(undefined)}
            >
              Cancel
            </button>
            <button type="submit" className="fgp-btn fgp-btn-primary">
              <Save size={18} /> {editingTemplate ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="fgp-template-grid">
        {templates.map(template => (
          <div key={template.id} className="fgp-template-card">
            <div className="fgp-template-header">
              <h4>{template.name}</h4>
              <span className="fgp-mode-badge">
                {template.settings.mode === 'share_original' ? 'Share' : 'Repost'}
              </span>
            </div>
            <p className="fgp-template-preview">{template.caption.slice(0, 100)}...</p>
            <div className="fgp-template-actions">
              <button
                className="fgp-btn-icon"
                onClick={() => setEditingTemplate(template)}
                title="Edit"
              >
                <Edit size={16} />
              </button>
              <button className="fgp-btn-icon" onClick={() => onDelete(template.id)} title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 && !editingTemplate && (
          <div className="fgp-empty-state">
            <FileText size={48} />
            <p>No templates yet</p>
            <button
              className="fgp-btn fgp-btn-primary"
              onClick={() => setEditingTemplate(undefined)}
            >
              Create your first template
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ImagesTabProps {
  imageSets: ImageSet[];
  editingImageSet: ImageSet | undefined;
  setEditingImageSet: (imageSet: ImageSet | undefined) => void;
  onSave: (imageSet: ImageSet) => void;
  onDelete: (id: string) => void;
}

function ImagesTab({
  imageSets,
  editingImageSet,
  setEditingImageSet,
  onSave,
  onDelete,
}: ImagesTabProps) {
  const [formData, setFormData] = useState({ name: '', imageUrls: '' });

  useEffect(() => {
    if (editingImageSet) {
      setFormData({ name: editingImageSet.name, imageUrls: editingImageSet.imageUrls.join('\n') });
    } else {
      setFormData({ name: '', imageUrls: '' });
    }
  }, [editingImageSet]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sanitizeImageSetName(formData.name);
    if (!name.trim()) return;
    const urls = formData.imageUrls
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean);
    const imageSet: ImageSet = {
      id: editingImageSet?.id || `images_${Date.now()}`,
      name,
      imageUrls: urls,
      createdAt: editingImageSet?.createdAt || Date.now(),
    };
    onSave(imageSet);
    setFormData({ name: '', imageUrls: '' });
  };

  return (
    <div className="fgp-tab-panel">
      <div className="fgp-panel-header">
        <h2>Image Sets</h2>
        <button
          className="fgp-btn fgp-btn-primary"
          onClick={() =>
            setEditingImageSet({
              id: `images_${Date.now()}`,
              name: '',
              imageUrls: [],
              createdAt: Date.now(),
            })
          }
        >
          <Plus size={18} /> New Image Set
        </button>
      </div>

      {editingImageSet !== undefined && (
        <form className="fgp-form" onSubmit={handleSubmit}>
          <div className="fgp-form-row">
            <label>Set Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e =>
                setFormData({ ...formData, name: sanitizeImageSetName(e.target.value) })
              }
              placeholder="My Images"
              required
            />
          </div>
          <div className="fgp-form-row">
            <label>Image URLs (one per line)</label>
            <textarea
              value={formData.imageUrls}
              onChange={e => setFormData({ ...formData, imageUrls: e.target.value })}
              rows={6}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
            />
          </div>
          <div className="fgp-form-actions">
            <button
              type="button"
              className="fgp-btn fgp-btn-secondary"
              onClick={() => setEditingImageSet(undefined)}
            >
              Cancel
            </button>
            <button type="submit" className="fgp-btn fgp-btn-primary">
              <Save size={18} /> {editingImageSet ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="fgp-image-grid">
        {imageSets.map(set => (
          <div key={set.id} className="fgp-image-card">
            <div className="fgp-image-preview">
              {set.imageUrls.slice(0, 4).map((url, i) => (
                <img key={i} src={url} alt="" loading="lazy" />
              ))}
              {set.imageUrls.length > 4 && (
                <div className="fgp-image-more">+{set.imageUrls.length - 4}</div>
              )}
            </div>
            <div className="fgp-image-info">
              <h4>{set.name}</h4>
              <span>{set.imageUrls.length} images</span>
            </div>
            <div className="fgp-image-actions">
              <button className="fgp-btn-icon" onClick={() => setEditingImageSet(set)} title="Edit">
                <Edit size={16} />
              </button>
              <button className="fgp-btn-icon" onClick={() => onDelete(set.id)} title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {imageSets.length === 0 && !editingImageSet && (
          <div className="fgp-empty-state">
            <Image size={48} />
            <p>No image sets yet</p>
            <button
              className="fgp-btn fgp-btn-primary"
              onClick={() => setEditingImageSet(undefined)}
            >
              Create your first image set
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SettingsTabProps {
  settings: UserSettings;
  setSettings: (settings: UserSettings) => void;
}

function SettingsTab({ settings, setSettings }: SettingsTabProps) {
  const handleChange = (key: keyof UserSettings, value: any) => {
    setSettings({ ...settings, [key]: value });
    chrome.runtime.sendMessage({ type: 'UPDATE_USER_SETTINGS', settings: { [key]: value } });
  };

  return (
    <div className="fgp-tab-panel">
      <div className="fgp-panel-header">
        <h2>Settings</h2>
      </div>

      <div className="fgp-settings-section">
        <h3>Appearance</h3>
        <div className="fgp-setting-row">
          <label>Theme</label>
          <select value={settings.theme} onChange={e => handleChange('theme', e.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <div className="fgp-settings-section">
        <h3>Share Button on Facebook</h3>
        <div className="fgp-setting-row">
          <label>Show "Share to Groups" button</label>
          <input
            type="checkbox"
            checked={settings.showShareButton}
            onChange={e => handleChange('showShareButton', e.target.checked)}
          />
        </div>
        <div className="fgp-setting-row">
          <label>Button Position</label>
          <select
            value={settings.shareButtonPosition}
            onChange={e => handleChange('shareButtonPosition', e.target.value)}
          >
            <option value="after_share">After Facebook's Share</option>
            <option value="before_share">Before Facebook's Share</option>
            <option value="floating">Floating button</option>
          </select>
        </div>
        <div className="fgp-setting-row">
          <label>Auto-detect groups on Facebook</label>
          <input
            type="checkbox"
            checked={settings.autoDetectGroups}
            onChange={e => handleChange('autoDetectGroups', e.target.checked)}
          />
        </div>
        <div className="fgp-setting-row">
          <label>Confirm before sharing</label>
          <input
            type="checkbox"
            checked={settings.confirmBeforeShare}
            onChange={e => handleChange('confirmBeforeShare', e.target.checked)}
          />
        </div>
      </div>

      <div className="fgp-settings-section">
        <h3>Notifications</h3>
        <div className="fgp-setting-row">
          <label>Sound notifications</label>
          <input
            type="checkbox"
            checked={settings.soundNotifications}
            onChange={e => handleChange('soundNotifications', e.target.checked)}
          />
        </div>
        <div className="fgp-setting-row">
          <label>Desktop notifications</label>
          <input
            type="checkbox"
            checked={settings.desktopNotifications}
            onChange={e => handleChange('desktopNotifications', e.target.checked)}
          />
        </div>
      </div>

      <div className="fgp-settings-section">
        <h3>Privacy</h3>
        <div className="fgp-setting-row">
          <label>Anonymous usage analytics</label>
          <input
            type="checkbox"
            checked={settings.analyticsOptIn}
            onChange={e => handleChange('analyticsOptIn', e.target.checked)}
          />
        </div>
        <p className="fgp-hint">All data stays on your device. No tracking, no external servers.</p>
      </div>

      <div className="fgp-settings-section">
        <h3>Danger Zone</h3>
        <button
          className="fgp-btn fgp-btn-danger"
          onClick={() => {
            if (confirm('Delete ALL data? This cannot be undone.')) {
              chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
              alert('All data cleared!');
            }
          }}
        >
          <Trash2 size={18} /> Clear All Data
        </button>
      </div>
    </div>
  );
}

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
