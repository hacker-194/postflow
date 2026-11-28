import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Users,
  Plus,
  Trash2,
  Edit,
  Download,
  Upload,
  Trash,
  X,
  Image,
  FileText,
  Loader2,
  Save,
  Facebook,
  MessageSquare,
  Globe,
} from 'lucide-react';
import type {
  Group,
  GroupList,
  Template,
  ImageSet,
  ShareSettings,
  UserSettings,
  Platform,
} from '../shared/types';

interface OptionsState {
  activeTab: 'groups' | 'templates' | 'images' | 'settings';
  groups: Group[];
  groupLists: GroupList[];
  templates: Template[];
  imageSets: ImageSet[];
  userSettings: UserSettings;
  loading: boolean;
  syncing: { [platform: string]: boolean };
  lastSyncResult: string | null;
  editingGroup: Group | null;
  editingTemplate: Template | null;
  editingImageSet: ImageSet | null;
  editingList: GroupList | null;
  showGroupModal: boolean;
  showTemplateModal: boolean;
  showImageSetModal: boolean;
  showListModal: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  confirmDialog: {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null;
}

const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  mode: 'share_original',
  caption: '',
  firstComment: '',
  useSpintax: false,
  delayBetweenGroups: 90000,
  safetyLevel: 'balanced',
  overnightPause: true,
  overnightStart: '22:00',
  overnightEnd: '07:00',
  maxPostsPerDay: 20,
};

const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'system',
  language: 'en',
  showShareButton: true,
  shareButtonPosition: 'after_share',
  autoDetectGroups: true,
  confirmBeforeShare: true,
  soundNotifications: true,
  desktopNotifications: true,
  analyticsOptIn: false,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
};

const PLATFORM_COLORS: Record<Platform, string> = {
  facebook: '#1877f2',
  whatsapp: '#25d366',
  messenger: '#0084ff',
};

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  facebook: <Facebook size={16} />,
  whatsapp: <MessageSquare size={16} />,
  messenger: <Globe size={16} />,
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function App() {
  const [state, setState] = useState<OptionsState>({
    activeTab: 'groups',
    groups: [],
    groupLists: [],
    templates: [],
    imageSets: [],
    userSettings: DEFAULT_USER_SETTINGS,
    loading: true,
    syncing: {},
    lastSyncResult: null,
    editingGroup: null,
    editingTemplate: null,
    editingImageSet: null,
    editingList: null,
    showGroupModal: false,
    showTemplateModal: false,
    showImageSetModal: false,
    showListModal: false,
    toast: null,
    confirmDialog: null,
  });

  const unwrap = <T,>(res: { success: boolean; data?: T; error?: string }): T | undefined => {
    if (!res?.success) {
      console.error('Message failed:', res?.error);
      return undefined;
    }
    return res.data;
  };

  const send = async (message: Record<string, unknown>): Promise<boolean> => {
    const res = await chrome.runtime.sendMessage(message);
    if (!res?.success) {
      setState(s => ({
        ...s,
        toast: { message: res?.error || 'Something went wrong. Please try again.', type: 'error' },
      }));
      return false;
    }
    return true;
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setState(s => ({ ...s, toast: { message, type } }));
    setTimeout(() => setState(s => ({ ...s, toast: null })), 5000);
  }, []);

  const showConfirm = useCallback(
    (message: string, onConfirm: () => void, onCancel: () => void = () => {}) => {
      setState(s => ({ ...s, confirmDialog: { message, onConfirm, onCancel } }));
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setState(s => ({ ...s, confirmDialog: null }));
  }, []);

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const [groups, groupLists, templates, imageSets, userSettings] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_ALL_GROUPS' }),
        chrome.runtime.sendMessage({ type: 'GET_GROUP_LISTS' }),
        chrome.runtime.sendMessage({ type: 'GET_TEMPLATES' }),
        chrome.runtime.sendMessage({ type: 'GET_IMAGE_SETS' }),
        chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }),
      ]);
      setState(s => ({
        ...s,
        groups: unwrap<Group[]>(groups) || [],
        groupLists: unwrap<GroupList[]>(groupLists) || [],
        templates: unwrap<Template[]>(templates) || [],
        imageSets: unwrap<ImageSet[]>(imageSets) || [],
        userSettings: unwrap<UserSettings>(userSettings) || s.userSettings,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to load data:', error);
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSyncGroups = async (platform: Platform) => {
    const messageType =
      platform === 'facebook'
        ? 'SYNC_GROUPS'
        : platform === 'whatsapp'
          ? 'SYNC_WHATSAPP_GROUPS'
          : 'SYNC_MESSENGER_GROUPS';
    const url =
      platform === 'facebook'
        ? 'https://facebook.com/groups/feed/'
        : platform === 'whatsapp'
          ? 'https://web.whatsapp.com'
          : 'https://messenger.com';

    setState(s => ({ ...s, syncing: { ...s.syncing, [platform]: true }, lastSyncResult: null }));

    try {
      await chrome.tabs.create({ url, active: true });
      await new Promise(resolve => setTimeout(resolve, 8000));
      const result = await chrome.runtime.sendMessage({ type: messageType });
      if (result?.success && result.groups) {
        setState(s => ({
          ...s,
          lastSyncResult: `✅ Found ${result.groups.length} ${PLATFORM_LABELS[platform]} groups!`,
        }));
        refresh();
      } else {
        setState(s => ({
          ...s,
          lastSyncResult: `❌ ${result.error || 'Failed - make sure page loaded fully'}`,
        }));
      }
    } catch (error) {
      setState(s => ({ ...s, lastSyncResult: `❌ ${error}` }));
    } finally {
      setState(s => ({ ...s, syncing: { ...s.syncing, [platform]: false } }));
    }
  };

  const handleSaveGroup = async (group: Group) => {
    if (!(await send({ type: 'SAVE_GROUP', group }))) return;
    setState(s => ({ ...s, showGroupModal: false, editingGroup: null }));
    refresh();
  };

  const handleDeleteGroup = async (id: string) => {
    showConfirm(
      'Delete this group?',
      async () => {
        await chrome.runtime.sendMessage({ type: 'DELETE_GROUP', id });
        refresh();
        showToast('Group deleted', 'success');
      },
      closeConfirm
    );
  };

  const handleSaveGroupList = async (list: GroupList) => {
    if (!(await send({ type: 'SAVE_GROUP_LIST', list }))) return;
    setState(s => ({ ...s, showListModal: false, editingList: null }));
    refresh();
    showToast('Group list saved', 'success');
  };

  const handleDeleteGroupList = async (id: string) => {
    showConfirm(
      'Delete this group list?',
      async () => {
        await chrome.runtime.sendMessage({ type: 'DELETE_GROUP_LIST', id });
        refresh();
        showToast('Group list deleted', 'success');
      },
      closeConfirm
    );
  };

  const handleSaveTemplate = async (template: Template) => {
    if (!(await send({ type: 'SAVE_TEMPLATE', template }))) return;
    setState(s => ({ ...s, showTemplateModal: false, editingTemplate: null }));
    refresh();
    showToast('Template saved', 'success');
  };

  const handleDeleteTemplate = async (id: string) => {
    showConfirm(
      'Delete this template?',
      async () => {
        await chrome.runtime.sendMessage({ type: 'DELETE_TEMPLATE', id });
        refresh();
        showToast('Template deleted', 'success');
      },
      closeConfirm
    );
  };

  const handleSaveImageSet = async (imageSet: ImageSet) => {
    if (!(await send({ type: 'SAVE_IMAGE_SET', imageSet }))) return;
    setState(s => ({ ...s, showImageSetModal: false, editingImageSet: null }));
    refresh();
    showToast('Image set saved', 'success');
  };

  const handleDeleteImageSet = async (id: string) => {
    showConfirm(
      'Delete this image set?',
      async () => {
        await chrome.runtime.sendMessage({ type: 'DELETE_IMAGE_SET', id });
        refresh();
        showToast('Image set deleted', 'success');
      },
      closeConfirm
    );
  };

  const handleExportData = async () => {
    const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
    if (data) {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fgp-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported successfully', 'success');
    } else {
      showToast('No data to export', 'error');
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        await chrome.runtime.sendMessage({ type: 'IMPORT_DATA', data: text });
        showToast('Data imported successfully!', 'success');
        refresh();
      }
    };
    input.click();
  };

  const handleClearAllData = () => {
    showConfirm(
      'This will delete ALL your groups, lists, templates, images, history, and settings. Are you sure?',
      async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
        showToast('All data cleared!', 'success');
        refresh();
      },
      closeConfirm
    );
  };

  const openGroupModal = (group?: Group) => {
    setState(s => ({
      ...s,
      editingGroup: group || {
        id: '',
        name: '',
        url: '',
        platform: 'facebook',
        addedAt: Date.now(),
      },
      showGroupModal: true,
    }));
  };

  const openListModal = (list?: GroupList) => {
    const newList: GroupList = list || {
      id: generateId('list'),
      name: '',
      groupIds: [],
      color: '#1877f2',
      platform: 'facebook',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState(s => ({ ...s, editingList: newList, showListModal: true }));
  };

  const openTemplateModal = (template?: Template) => {
    const newTemplate: Template = template || {
      id: generateId('template'),
      name: '',
      caption: '',
      firstComment: '',
      settings: DEFAULT_SHARE_SETTINGS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState(s => ({ ...s, editingTemplate: newTemplate, showTemplateModal: true }));
  };

  const openImageSetModal = (imageSet?: ImageSet) => {
    const newImageSet: ImageSet = imageSet || {
      id: generateId('images'),
      name: '',
      imageUrls: [],
      createdAt: Date.now(),
    };
    setState(s => ({ ...s, editingImageSet: newImageSet, showImageSetModal: true }));
  };

  const closeModals = () => {
    setState(s => ({
      ...s,
      showGroupModal: false,
      showTemplateModal: false,
      showImageSetModal: false,
      showListModal: false,
      editingGroup: null,
      editingTemplate: null,
      editingImageSet: null,
      editingList: null,
    }));
  };

  if (state.loading) {
    return (
      <div className="fgp-options-loading">
        <Loader2 size={32} className="fgp-spin" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="fgp-options">
      <header className="fgp-options-header">
        <div className="fgp-options-title">
          <Users size={28} />
          <h1>Free Group Poster</h1>
        </div>
        <div className="fgp-options-version">v1.0.0</div>
      </header>

      <nav className="fgp-options-nav" role="tablist" aria-label="Main navigation">
        <button
          role="tab"
          id="tab-groups"
          aria-controls="panel-groups"
          aria-selected={state.activeTab === 'groups'}
          className={`fgp-nav-tab ${state.activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setState(s => ({ ...s, activeTab: 'groups' }))}
        >
          <Users size={18} aria-hidden="true" /> Groups & Lists
        </button>
        <button
          role="tab"
          id="tab-templates"
          aria-controls="panel-templates"
          aria-selected={state.activeTab === 'templates'}
          className={`fgp-nav-tab ${state.activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setState(s => ({ ...s, activeTab: 'templates' }))}
        >
          <FileText size={18} aria-hidden="true" /> Templates
        </button>
        <button
          role="tab"
          id="tab-images"
          aria-controls="panel-images"
          aria-selected={state.activeTab === 'images'}
          className={`fgp-nav-tab ${state.activeTab === 'images' ? 'active' : ''}`}
          onClick={() => setState(s => ({ ...s, activeTab: 'images' }))}
        >
          <Image size={18} aria-hidden="true" /> Image Sets
        </button>
        <button
          role="tab"
          id="tab-settings"
          aria-controls="panel-settings"
          aria-selected={state.activeTab === 'settings'}
          className={`fgp-nav-tab ${state.activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setState(s => ({ ...s, activeTab: 'settings' }))}
        >
          Settings
        </button>
      </nav>

      <main className="fgp-options-main" role="main">
        {state.lastSyncResult && (
          <div
            className={`fgp-toast ${state.lastSyncResult.startsWith('✅') ? 'success' : 'error'}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {state.lastSyncResult}
          </div>
        )}

        {state.activeTab === 'groups' && (
          <div id="panel-groups" role="tabpanel" aria-labelledby="tab-groups" tabIndex={0}>
            <GroupsTab
              groups={state.groups}
              groupLists={state.groupLists}
              onSyncGroups={handleSyncGroups}
              onSaveGroup={handleSaveGroup}
              onDeleteGroup={handleDeleteGroup}
              onSaveGroupList={handleSaveGroupList}
              onDeleteGroupList={handleDeleteGroupList}
              onOpenGroupModal={openGroupModal}
              onOpenListModal={openListModal}
              syncing={state.syncing}
            />
          </div>
        )}

        {state.activeTab === 'templates' && (
          <div id="panel-templates" role="tabpanel" aria-labelledby="tab-templates" tabIndex={0}>
            <TemplatesTab
              templates={state.templates}
              onSaveTemplate={handleSaveTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onOpenTemplateModal={openTemplateModal}
            />
          </div>
        )}

        {state.activeTab === 'images' && (
          <div id="panel-images" role="tabpanel" aria-labelledby="tab-images" tabIndex={0}>
            <ImagesTab
              imageSets={state.imageSets}
              onSaveImageSet={handleSaveImageSet}
              onDeleteImageSet={handleDeleteImageSet}
              onOpenImageSetModal={openImageSetModal}
            />
          </div>
        )}

        {state.activeTab === 'settings' && (
          <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" tabIndex={0}>
            <SettingsTab
              userSettings={state.userSettings}
              onExportData={handleExportData}
              onImportData={handleImportData}
              onClearAllData={handleClearAllData}
            />
          </div>
        )}
      </main>

      {state.showGroupModal && state.editingGroup && (
        <GroupModal group={state.editingGroup} onSave={handleSaveGroup} onClose={closeModals} />
      )}

      {state.showListModal && state.editingList && (
        <GroupListModal
          list={state.editingList}
          groups={state.groups}
          onSave={handleSaveGroupList}
          onClose={closeModals}
        />
      )}

      {state.showTemplateModal && state.editingTemplate && (
        <TemplateModal
          template={state.editingTemplate}
          onSave={handleSaveTemplate}
          onClose={closeModals}
        />
      )}

      {state.showImageSetModal && state.editingImageSet && (
        <ImageSetModal
          imageSet={state.editingImageSet}
          onSave={handleSaveImageSet}
          onClose={closeModals}
        />
      )}

      {state.toast && (
        <div
          className={`fgp-toast ${state.toast.type}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {state.toast.message}
        </div>
      )}

      {state.confirmDialog && (
        <div className="fgp-modal-overlay" role="presentation">
          <div
            className="fgp-modal fgp-modal-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            tabIndex={-1}
          >
            <div className="fgp-modal-header">
              <h3 id="confirm-title">Confirm</h3>
            </div>
            <div className="fgp-modal-body">
              <p>{state.confirmDialog.message}</p>
            </div>
            <div className="fgp-modal-footer">
              <button
                className="fgp-btn fgp-btn-secondary"
                onClick={() => {
                  state.confirmDialog.onCancel();
                  closeConfirm();
                }}
              >
                Cancel
              </button>
              <button
                className="fgp-btn fgp-btn-danger"
                onClick={() => {
                  state.confirmDialog.onConfirm();
                  closeConfirm();
                }}
                autoFocus
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupsTab({
  groups,
  groupLists,
  onSyncGroups,
  onDeleteGroup,
  onDeleteGroupList,
  onOpenGroupModal,
  onOpenListModal,
  syncing,
}: {
  groups: Group[];
  groupLists: GroupList[];
  onSyncGroups: (platform: Platform) => void;
  onDeleteGroup: (id: string) => void;
  onDeleteGroupList: (id: string) => void;
  onOpenGroupModal: (group?: Group) => void;
  onOpenListModal: (list?: GroupList) => void;
  syncing: { [platform: string]: boolean };
}) {
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [filterList, setFilterList] = useState<string>('all');
  const platformGroups = ['facebook', 'whatsapp', 'messenger'] as Platform[];

  const filteredGroups = groups.filter(g => {
    const platformMatch = filterPlatform === 'all' || g.platform === filterPlatform;
    const listMatch =
      filterList === 'all' ||
      groupLists.some(l => l.id === filterList && l.groupIds.includes(g.id));
    return platformMatch && listMatch;
  });

  return (
    <div className="fgp-tab-content" role="region" aria-label="Groups and Lists">
      <div className="fgp-section-header">
        <h2>Groups & Lists</h2>
        <div className="fgp-action-row">
          <label htmlFor="filter-platform" className="fgp-sr-only">
            Filter by platform
          </label>
          <select
            id="filter-platform"
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value as Platform | 'all')}
            className="fgp-select fgp-select-sm"
          >
            <option value="all">All Platforms</option>
            <option value="facebook">Facebook</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
          </select>
          <label htmlFor="filter-list" className="fgp-sr-only">
            Filter by list
          </label>
          <select
            id="filter-list"
            value={filterList}
            onChange={e => setFilterList(e.target.value)}
            className="fgp-select fgp-select-sm"
          >
            <option value="all">All Lists</option>
            {groupLists.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="fgp-btn fgp-btn-primary fgp-btn-sm" onClick={() => onOpenGroupModal()}>
            <Plus size={16} aria-hidden="true" /> Add Group
          </button>
          <button className="fgp-btn fgp-btn-primary fgp-btn-sm" onClick={() => onOpenListModal()}>
            <Plus size={16} aria-hidden="true" /> New List
          </button>
        </div>
      </div>

      <div className="fgp-sync-row" role="group" aria-label="Sync groups from platforms">
        {platformGroups.map(platform => (
          <button
            key={platform}
            className={`fgp-btn fgp-btn-secondary fgp-sync-btn ${syncing[platform] ? 'syncing' : ''}`}
            onClick={() => onSyncGroups(platform)}
            disabled={syncing[platform]}
            style={{ borderColor: PLATFORM_COLORS[platform] }}
            aria-busy={syncing[platform]}
            aria-pressed={syncing[platform]}
          >
            {PLATFORM_ICONS[platform]}
            {syncing[platform] ? (
              <>
                <Loader2 size={16} className="fgp-spin" aria-hidden="true" /> Syncing...
              </>
            ) : (
              `Sync ${PLATFORM_LABELS[platform]}`
            )}
          </button>
        ))}
      </div>

      {groupLists.length > 0 && (
        <div className="fgp-section" aria-labelledby="lists-heading">
          <h3 id="lists-heading">Group Lists ({groupLists.length})</h3>
          <div className="fgp-list-grid" role="list" aria-label="Group lists">
            {groupLists.map(list => (
              <div
                key={list.id}
                className="fgp-list-card"
                style={{ borderColor: list.color }}
                role="listitem"
              >
                <div className="fgp-list-header" style={{ background: list.color }}>
                  <span>{list.name}</span>
                  <span className="fgp-list-count">{list.groupIds.length} groups</span>
                </div>
                <div
                  className="fgp-list-platform"
                  style={{ color: PLATFORM_COLORS[list.platform] || '#666' }}
                  aria-label={`Platform: ${PLATFORM_LABELS[list.platform] || list.platform}`}
                >
                  {PLATFORM_LABELS[list.platform] || list.platform}
                </div>
                <div className="fgp-list-actions">
                  <button
                    className="fgp-btn-icon"
                    onClick={() => onOpenListModal(list)}
                    aria-label={`Edit list ${list.name}`}
                  >
                    <Edit size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="fgp-btn-icon fgp-btn-icon-danger"
                    onClick={() => onDeleteGroupList(list.id)}
                    aria-label={`Delete list ${list.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fgp-section" aria-labelledby="groups-heading">
        <div className="fgp-section-header">
          <h3 id="groups-heading">Groups ({filteredGroups.length})</h3>
        </div>
        {filteredGroups.length === 0 ? (
          <div className="fgp-empty-state">
            <Users size={48} aria-hidden="true" />
            <p>No groups found</p>
            <button className="fgp-btn fgp-btn-primary" onClick={() => onOpenGroupModal()}>
              Add your first group
            </button>
          </div>
        ) : (
          <div className="fgp-groups-table" role="region" aria-label="Groups table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Platform</th>
                  <th scope="col">URL</th>
                  <th scope="col">Added</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map(group => (
                  <tr key={group.id}>
                    <td className="fgp-group-name">{group.name}</td>
                    <td>
                      <span
                        className="fgp-platform-badge"
                        style={{
                          background: PLATFORM_COLORS[group.platform] + '20',
                          color: PLATFORM_COLORS[group.platform],
                        }}
                        aria-label={`Platform: ${PLATFORM_LABELS[group.platform] || group.platform}`}
                      >
                        {PLATFORM_ICONS[group.platform]}
                        {PLATFORM_LABELS[group.platform] || group.platform}
                      </span>
                    </td>
                    <td className="fgp-group-url" title={group.url}>
                      {group.url ? new URL(group.url).hostname : '-'}
                    </td>
                    <td>{formatTime(group.addedAt)}</td>
                    <td>
                      <div className="fgp-action-buttons-sm">
                        <button
                          className="fgp-btn-icon"
                          onClick={() => onOpenGroupModal(group)}
                          aria-label={`Edit group ${group.name}`}
                        >
                          <Edit size={14} aria-hidden="true" />
                        </button>
                        <button
                          className="fgp-btn-icon fgp-btn-icon-danger"
                          onClick={() => onDeleteGroup(group.id)}
                          aria-label={`Delete group ${group.name}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupModal({
  group,
  onSave,
  onClose,
}: {
  group: Group;
  onSave: (group: Group) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [url, setUrl] = useState(group.url);
  const [platform, setPlatform] = useState<Platform>(group.platform);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (url && !url.startsWith('http'))
      newErrors.url = 'Valid URL required (must start with http:// or https://)';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    const savedGroup: Group = {
      ...group,
      id: group.id || generateId('group'),
      name: name.trim(),
      url: url.trim(),
      platform,
      addedAt: group.addedAt || Date.now(),
    };
    await onSave(savedGroup);
    setSaving(false);
  };

  // Focus management
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    // Trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          const first = focusableElements[0] as HTMLElement;
          const last = focusableElements[focusableElements.length - 1] as HTMLElement;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fgp-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="fgp-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-modal-title"
        tabIndex={-1}
      >
        <div className="fgp-modal-header">
          <h3 id="group-modal-title">{group.id ? 'Edit Group' : 'Add Group'}</h3>
          <button className="fgp-btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="fgp-modal-body">
          <div className="fgp-form-field">
            <label htmlFor="group-name">Name *</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Group name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'group-name-error' : undefined}
            />
            {errors.name && (
              <span id="group-name-error" className="fgp-form-error" role="alert">
                {errors.name}
              </span>
            )}
          </div>
          <div className="fgp-form-field">
            <label htmlFor="group-url">URL</label>
            <input
              id="group-url"
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              aria-invalid={!!errors.url}
              aria-describedby={errors.url ? 'group-url-error' : undefined}
            />
            {errors.url && (
              <span id="group-url-error" className="fgp-form-error" role="alert">
                {errors.url}
              </span>
            )}
          </div>
          <div className="fgp-form-field">
            <label htmlFor="group-platform">Platform *</label>
            <select
              id="group-platform"
              value={platform}
              onChange={e => setPlatform(e.target.value as Platform)}
              className="fgp-select"
            >
              <option value="facebook">Facebook</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="messenger">Messenger</option>
            </select>
          </div>
        </div>
        <div className="fgp-modal-footer">
          <button className="fgp-btn fgp-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="fgp-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} aria-hidden="true" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupListModal({
  list,
  groups,
  onSave,
  onClose,
}: {
  list: GroupList;
  groups: Group[];
  onSave: (list: GroupList) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);
  const [platform, setPlatform] = useState<Platform>(list.platform);
  const [groupIds, setGroupIds] = useState<string[]>(list.groupIds);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const platformGroups = groups.filter(g => g.platform === platform);

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'List name is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    const savedList: GroupList = {
      ...list,
      id: list.id || generateId('list'),
      name: name.trim(),
      groupIds,
      color,
      platform,
      createdAt: list.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await onSave(savedList);
    setSaving(false);
  };

  // Focus management
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          const first = focusableElements[0] as HTMLElement;
          const last = focusableElements[focusableElements.length - 1] as HTMLElement;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fgp-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="fgp-modal fgp-modal-lg"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-modal-title"
        tabIndex={-1}
      >
        <div className="fgp-modal-header">
          <h3 id="list-modal-title">
            {list.id.startsWith('list_') && !list.name ? 'New Group List' : 'Edit Group List'}
          </h3>
          <button className="fgp-btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="fgp-modal-body">
          <div className="fgp-form-row">
            <div className="fgp-form-field">
              <label htmlFor="list-name">List Name *</label>
              <input
                id="list-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Group List"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'list-name-error' : undefined}
              />
              {errors.name && (
                <span id="list-name-error" className="fgp-form-error" role="alert">
                  {errors.name}
                </span>
              )}
            </div>
            <div className="fgp-form-field">
              <label htmlFor="list-color">Color</label>
              <input
                id="list-color"
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                aria-label="List color"
              />
            </div>
          </div>
          <div className="fgp-form-field">
            <label htmlFor="list-platform">Platform</label>
            <select
              id="list-platform"
              value={platform}
              onChange={e => {
                setPlatform(e.target.value as Platform);
                setGroupIds([]);
              }}
              className="fgp-select"
            >
              <option value="facebook">Facebook</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="messenger">Messenger</option>
            </select>
          </div>
          <div className="fgp-form-field">
            <label>
              Groups ({platformGroups.length} available, {groupIds.length} selected)
            </label>
            <div
              className="fgp-group-multi-select"
              role="group"
              aria-label="Select groups for this list"
            >
              {platformGroups.map(group => (
                <label key={group.id} className="fgp-checkbox-label">
                  <input
                    type="checkbox"
                    checked={groupIds.includes(group.id)}
                    onChange={e =>
                      setGroupIds(prev =>
                        e.target.checked ? [...prev, group.id] : prev.filter(id => id !== group.id)
                      )
                    }
                  />
                  <span>{group.name}</span>
                </label>
              ))}
              {platformGroups.length === 0 && (
                <p className="fgp-muted">No groups for this platform. Sync groups first.</p>
              )}
            </div>
          </div>
        </div>
        <div className="fgp-modal-footer">
          <button className="fgp-btn fgp-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="fgp-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} aria-hidden="true" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatesTab({
  templates,
  onDeleteTemplate,
  onOpenTemplateModal,
}: {
  templates: Template[];
  onDeleteTemplate: (id: string) => void;
  onOpenTemplateModal: (template?: Template) => void;
}) {
  return (
    <div className="fgp-tab-content" role="region" aria-label="Templates">
      <div className="fgp-section-header">
        <h2>Templates</h2>
        <button className="fgp-btn fgp-btn-primary" onClick={() => onOpenTemplateModal()}>
          <Plus size={16} aria-hidden="true" /> New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="fgp-empty-state">
          <FileText size={48} aria-hidden="true" />
          <p>No templates yet</p>
          <button className="fgp-btn fgp-btn-primary" onClick={() => onOpenTemplateModal()}>
            Create your first template
          </button>
        </div>
      ) : (
        <div className="fgp-template-grid" role="list" aria-label="Templates">
          {templates.map(template => (
            <div key={template.id} className="fgp-template-card" role="listitem">
              <div className="fgp-template-header">
                <h4>{template.name}</h4>
                <div className="fgp-template-actions">
                  <button
                    className="fgp-btn-icon"
                    onClick={() => onOpenTemplateModal(template)}
                    aria-label={`Edit template ${template.name}`}
                  >
                    <Edit size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="fgp-btn-icon fgp-btn-icon-danger"
                    onClick={() => onDeleteTemplate(template.id)}
                    aria-label={`Delete template ${template.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="fgp-template-preview">
                <p>{template.caption || '<no caption>'}</p>
                {template.firstComment && (
                  <p
                    className="fgp-first-comment"
                    aria-label={`First comment: ${template.firstComment}`}
                  >
                    💬 {template.firstComment}
                  </p>
                )}
              </div>
              <div className="fgp-template-meta" aria-label="Template settings">
                <span>
                  {template.settings.mode === 'share_original' ? 'Share Original' : 'Repost as Me'}
                </span>
                <span>{template.settings.safetyLevel}</span>
                <span>Delay: {Math.round(template.settings.delayBetweenGroups / 1000)}s</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onSave,
  onClose,
}: {
  template: Template;
  onSave: (template: Template) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [caption, setCaption] = useState(template.caption);
  const [firstComment, setFirstComment] = useState(template.firstComment || '');
  const [mode, setMode] = useState<ShareSettings['mode']>(template.settings.mode);
  const [useSpintax, setUseSpintax] = useState(template.settings.useSpintax);
  const [delayBetweenGroups, setDelayBetweenGroups] = useState(
    template.settings.delayBetweenGroups
  );
  const [safetyLevel, setSafetyLevel] = useState(template.settings.safetyLevel);
  const [overnightPause, setOvernightPause] = useState(template.settings.overnightPause);
  const [maxPostsPerDay, setMaxPostsPerDay] = useState(template.settings.maxPostsPerDay);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Template name is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    const savedTemplate: Template = {
      ...template,
      id: template.id || generateId('template'),
      name: name.trim(),
      caption: caption.trim(),
      firstComment: firstComment.trim(),
      settings: {
        mode,
        caption: caption.trim(),
        firstComment: firstComment.trim(),
        useSpintax,
        delayBetweenGroups,
        safetyLevel,
        overnightPause,
        overnightStart: template.settings.overnightStart || '22:00',
        overnightEnd: template.settings.overnightEnd || '07:00',
        maxPostsPerDay,
      },
      createdAt: template.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await onSave(savedTemplate);
    setSaving(false);
  };

  // Focus management
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          const first = focusableElements[0] as HTMLElement;
          const last = focusableElements[focusableElements.length - 1] as HTMLElement;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fgp-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="fgp-modal fgp-modal-lg"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-modal-title"
        tabIndex={-1}
      >
        <div className="fgp-modal-header">
          <h3 id="template-modal-title">
            {template.id.startsWith('template_') && !template.name
              ? 'New Template'
              : 'Edit Template'}
          </h3>
          <button className="fgp-btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="fgp-modal-body">
          <div className="fgp-form-field">
            <label htmlFor="template-name">Template Name *</label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Template"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'template-name-error' : undefined}
            />
            {errors.name && (
              <span id="template-name-error" className="fgp-form-error" role="alert">
                {errors.name}
              </span>
            )}
          </div>
          <div className="fgp-form-field">
            <label htmlFor="template-caption">Caption</label>
            <textarea
              id="template-caption"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Post caption... Use {option1|option2} for spintax"
              rows={4}
            />
            <label className="fgp-checkbox-label">
              <input
                type="checkbox"
                checked={useSpintax}
                onChange={e => setUseSpintax(e.target.checked)}
              />
              <span>Enable spintax ({'{option1 | option2}'})</span>
            </label>
          </div>
          <div className="fgp-form-field">
            <label htmlFor="template-first-comment">First Comment</label>
            <textarea
              id="template-first-comment"
              value={firstComment}
              onChange={e => setFirstComment(e.target.value)}
              placeholder="First comment to post..."
              rows={2}
            />
          </div>
          <div className="fgp-form-row">
            <div className="fgp-form-field">
              <label htmlFor="template-mode">Mode</label>
              <select
                id="template-mode"
                value={mode}
                onChange={e => setMode(e.target.value as ShareSettings['mode'])}
                className="fgp-select"
              >
                <option value="share_original">Share Original Post</option>
                <option value="repost_content">Repost as My Content</option>
              </select>
            </div>
            <div className="fgp-form-field">
              <label htmlFor="template-safety">Safety Level</label>
              <select
                id="template-safety"
                value={safetyLevel}
                onChange={e => setSafetyLevel(e.target.value as ShareSettings['safetyLevel'])}
                className="fgp-select"
              >
                <option value="fast">Fast (30-60s)</option>
                <option value="balanced">Balanced (60-120s)</option>
                <option value="safe">Safe (120-180s)</option>
              </select>
            </div>
          </div>
          <div className="fgp-form-row">
            <div className="fgp-form-field">
              <label htmlFor="template-delay">Delay Between Groups (ms)</label>
              <input
                id="template-delay"
                type="number"
                value={delayBetweenGroups}
                onChange={e => setDelayBetweenGroups(parseInt(e.target.value) || 90000)}
                min="5000"
                max="3600000"
                step="5000"
              />
            </div>
            <div className="fgp-form-field">
              <label htmlFor="template-max-posts">Max Posts/Day</label>
              <input
                id="template-max-posts"
                type="number"
                value={maxPostsPerDay}
                onChange={e => setMaxPostsPerDay(parseInt(e.target.value) || 20)}
                min="1"
                max="500"
              />
            </div>
          </div>
          <div className="fgp-form-field">
            <label className="fgp-checkbox-label">
              <input
                type="checkbox"
                checked={overnightPause}
                onChange={e => setOvernightPause(e.target.checked)}
              />
              <span>Pause overnight (22:00 - 07:00)</span>
            </label>
          </div>
        </div>
        <div className="fgp-modal-footer">
          <button className="fgp-btn fgp-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="fgp-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} aria-hidden="true" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImagesTab({
  imageSets,
  onDeleteImageSet,
  onOpenImageSetModal,
}: {
  imageSets: ImageSet[];
  onDeleteImageSet: (id: string) => void;
  onOpenImageSetModal: (imageSet?: ImageSet) => void;
}) {
  return (
    <div className="fgp-tab-content" role="region" aria-label="Image Sets">
      <div className="fgp-section-header">
        <h2>Image Sets</h2>
        <button className="fgp-btn fgp-btn-primary" onClick={() => onOpenImageSetModal()}>
          <Plus size={16} aria-hidden="true" /> New Image Set
        </button>
      </div>

      {imageSets.length === 0 ? (
        <div className="fgp-empty-state">
          <Image size={48} aria-hidden="true" />
          <p>No image sets yet</p>
          <button className="fgp-btn fgp-btn-primary" onClick={() => onOpenImageSetModal()}>
            Create your first image set
          </button>
        </div>
      ) : (
        <div className="fgp-image-set-grid" role="list" aria-label="Image sets">
          {imageSets.map(imageSet => (
            <div key={imageSet.id} className="fgp-image-set-card" role="listitem">
              <div className="fgp-image-set-header">
                <h4>{imageSet.name}</h4>
                <div className="fgp-image-set-actions">
                  <button
                    className="fgp-btn-icon"
                    onClick={() => onOpenImageSetModal(imageSet)}
                    aria-label={`Edit image set ${imageSet.name}`}
                  >
                    <Edit size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="fgp-btn-icon fgp-btn-icon-danger"
                    onClick={() => onDeleteImageSet(imageSet.id)}
                    aria-label={`Delete image set ${imageSet.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div
                className="fgp-image-set-preview"
                role="img"
                aria-label={`${imageSet.name} preview`}
              >
                {imageSet.imageUrls.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} alt={`${imageSet.name} ${i + 1}`} loading="lazy" />
                ))}
                {imageSet.imageUrls.length > 4 && (
                  <div className="fgp-image-set-more" aria-hidden="true">
                    +{imageSet.imageUrls.length - 4} more
                  </div>
                )}
              </div>
              <div className="fgp-image-set-meta">
                {imageSet.imageUrls.length} image{imageSet.imageUrls.length !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageSetModal({
  imageSet,
  onSave,
  onClose,
}: {
  imageSet: ImageSet;
  onSave: (imageSet: ImageSet) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(imageSet.name);
  const [imageUrls, setImageUrls] = useState<string[]>(imageSet.imageUrls);
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const addUrl = () => {
    if (!newUrl.trim()) return;
    try {
      new URL(newUrl);
      if (!imageUrls.includes(newUrl.trim())) {
        setImageUrls([...imageUrls, newUrl.trim()].slice(0, 50));
        setNewUrl('');
        setErrors({});
      }
    } catch {
      setErrors({ url: 'Invalid URL format' });
    }
  };

  const removeUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Image set name is required';
    if (imageUrls.length === 0) newErrors.images = 'Add at least one image URL';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    const savedImageSet: ImageSet = {
      ...imageSet,
      id: imageSet.id || generateId('images'),
      name: name.trim(),
      imageUrls,
      createdAt: imageSet.createdAt || Date.now(),
    };
    await onSave(savedImageSet);
    setSaving(false);
  };

  // Focus management
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          const first = focusableElements[0] as HTMLElement;
          const last = focusableElements[focusableElements.length - 1] as HTMLElement;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fgp-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="fgp-modal fgp-modal-lg"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="imageset-modal-title"
        tabIndex={-1}
      >
        <div className="fgp-modal-header">
          <h3 id="imageset-modal-title">
            {imageSet.id.startsWith('images_') && !imageSet.name
              ? 'New Image Set'
              : 'Edit Image Set'}
          </h3>
          <button className="fgp-btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="fgp-modal-body">
          <div className="fgp-form-field">
            <label htmlFor="imageset-name">Image Set Name *</label>
            <input
              id="imageset-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Images"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'imageset-name-error' : undefined}
            />
            {errors.name && (
              <span id="imageset-name-error" className="fgp-form-error" role="alert">
                {errors.name}
              </span>
            )}
          </div>
          <div className="fgp-form-field">
            <label htmlFor="imageset-url">Image URLs (max 50)</label>
            <div className="fgp-url-input-row">
              <input
                id="imageset-url"
                type="text"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                onKeyDown={e => e.key === 'Enter' && addUrl()}
                aria-invalid={!!errors.url}
                aria-describedby={errors.url ? 'imageset-url-error' : undefined}
              />
              <button
                className="fgp-btn fgp-btn-sm fgp-btn-primary"
                onClick={addUrl}
                aria-label="Add image URL"
              >
                <Plus size={16} aria-hidden="true" /> Add
              </button>
            </div>
            {errors.url && (
              <span id="imageset-url-error" className="fgp-form-error" role="alert">
                {errors.url}
              </span>
            )}
            {errors.images && (
              <span id="imageset-images-error" className="fgp-form-error" role="alert">
                {errors.images}
              </span>
            )}
            <div className="fgp-image-url-list" role="list" aria-label="Added images">
              {imageUrls.map((url, i) => (
                <div key={i} className="fgp-image-url-item" role="listitem">
                  <img src={url} alt={`${imageSet.name || 'Image'} ${i + 1}`} loading="lazy" />
                  <span className="fgp-image-url-text" title={url}>
                    {url}
                  </span>
                  <button
                    className="fgp-btn-icon fgp-btn-icon-danger"
                    onClick={() => removeUrl(i)}
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {imageUrls.length === 0 && (
                <p className="fgp-muted" role="status">
                  No images added yet
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="fgp-modal-footer">
          <button className="fgp-btn fgp-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="fgp-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} aria-hidden="true" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({
  userSettings,
  onExportData,
  onImportData,
  onClearAllData,
}: {
  userSettings: UserSettings;
  onExportData: () => void;
  onImportData: () => void;
  onClearAllData: () => void;
}) {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(userSettings.theme);

  return (
    <div className="fgp-tab-content" role="region" aria-label="Settings">
      <div className="fgp-section" aria-labelledby="appearance-heading">
        <h3 id="appearance-heading">Appearance</h3>
        <div className="fgp-setting-row">
          <label htmlFor="theme-select">Theme</label>
          <select
            id="theme-select"
            value={theme}
            onChange={e => setTheme(e.target.value as 'system' | 'light' | 'dark')}
            className="fgp-select"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <div className="fgp-section" aria-labelledby="data-heading">
        <h3 id="data-heading">Data Management</h3>
        <div className="fgp-action-buttons">
          <button className="fgp-btn fgp-btn-secondary" onClick={onExportData}>
            <Download size={18} aria-hidden="true" /> Export Data
          </button>
          <button className="fgp-btn fgp-btn-secondary" onClick={onImportData}>
            <Upload size={18} aria-hidden="true" /> Import Data
          </button>
          <button className="fgp-btn fgp-btn-danger" onClick={onClearAllData}>
            <Trash size={18} aria-hidden="true" /> Clear All Data
          </button>
        </div>
      </div>

      <div className="fgp-section" aria-labelledby="about-heading">
        <h3 id="about-heading">About</h3>
        <div className="fgp-about">
          <p>
            <strong>Free Group Poster</strong> v1.0.0
          </p>
          <p>
            Free, open-source Chrome extension for sharing posts to multiple Facebook, WhatsApp, and
            Messenger groups.
          </p>
          <p>Built with ❤️ for the community. No tracking, no ads, fully local.</p>
          <a
            href="https://github.com/free-group-poster/free-group-poster"
            target="_blank"
            rel="noopener"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
