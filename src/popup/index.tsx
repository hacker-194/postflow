import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Users,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Settings,
  Plus,
  Trash2,
  Edit,
  Download,
  Upload,
  Calendar,
  X,
} from 'lucide-react';
import type { GroupList, ScheduledShare, ShareResult, UserSettings } from '../shared/types';

interface PopupState {
  activeTab: 'dashboard' | 'lists' | 'scheduled' | 'history' | 'settings';
  groupLists: GroupList[];
  scheduledShares: ScheduledShare[];
  shareHistory: ShareResult[];
  userSettings: UserSettings;
  dailyPosts: number;
  loading: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function isScheduledShareArray(arr: unknown): arr is ScheduledShare[] {
  return (
    Array.isArray(arr) &&
    arr.every(item => item != null && typeof item === 'object' && 'status' in item)
  );
}

function Dashboard({ state, refresh }: { state: PopupState; refresh: () => void }) {
  const scheduledShares = isScheduledShareArray(state.scheduledShares) ? state.scheduledShares : [];
  const pendingCount = scheduledShares.filter(
    (s): s is ScheduledShare => s.status === 'pending'
  ).length;
  const runningCount = scheduledShares.filter(
    (s): s is ScheduledShare => s.status === 'running'
  ).length;
  const completedToday = (state.shareHistory || []).filter(s => {
    const today = new Date().toISOString().split('T')[0];
    return (
      s.completedAt &&
      new Date(s.completedAt).toISOString().split('T')[0] === today &&
      s.status === 'completed'
    );
  }).length;

  const fbLists = state.groupLists.filter(l => l.platform === 'facebook').length;
  const waLists = state.groupLists.filter(l => l.platform === 'whatsapp').length;
  const msLists = state.groupLists.filter(l => l.platform === 'messenger').length;

  const openAndSync = (url: string, type: 'SYNC_WHATSAPP_GROUPS' | 'SYNC_MESSENGER_GROUPS') => {
    chrome.tabs.create({ url, active: true });
    setTimeout(async () => {
      try {
        const result = await chrome.runtime.sendMessage({ type });
        if (result.success && result.groups) {
          alert(`✅ Found ${result.groups.length} groups!`);
          refresh();
        } else {
          alert(`❌ ${result.error || 'Failed - make sure page loaded fully'}`);
        }
      } catch (error) {
        alert(`❌ ${error}`);
      }
    }, 8000);
  };

  return (
    <div
      className="fgp-tab-content"
      role="tabpanel"
      id="panel-dashboard"
      aria-labelledby="tab-dashboard"
      tabIndex={0}
      ref={el => {
        if (el) (window as Window & { __dashboardRef?: HTMLElement }).__dashboardRef = el;
      }}
    >
      <div className="fgp-stats-grid" role="list" aria-label="Statistics">
        <div className="fgp-stat-card" role="listitem">
          <div
            className="fgp-stat-icon"
            style={{ background: '#e7f3ff', color: '#1877f2' }}
            aria-hidden="true"
          >
            <Users size={24} aria-hidden="true" />
          </div>
          <div className="fgp-stat-info">
            <div className="fgp-stat-value">{state.groupLists.length}</div>
            <div className="fgp-stat-label">Group Lists</div>
          </div>
        </div>
        <div className="fgp-stat-card" role="listitem">
          <div
            className="fgp-stat-icon"
            style={{ background: '#fff3e0', color: '#f77f00' }}
            aria-hidden="true"
          >
            <Send size={24} aria-hidden="true" />
          </div>
          <div className="fgp-stat-info">
            <div className="fgp-stat-value">{state.dailyPosts}/200</div>
            <div className="fgp-stat-label">Posts Today</div>
          </div>
        </div>
        <div className="fgp-stat-card" role="listitem">
          <div
            className="fgp-stat-icon"
            style={{ background: '#e8f5e9', color: '#42b72a' }}
            aria-hidden="true"
          >
            <CheckCircle size={24} aria-hidden="true" />
          </div>
          <div className="fgp-stat-info">
            <div className="fgp-stat-value">{completedToday}</div>
            <div className="fgp-stat-label">Completed Today</div>
          </div>
        </div>
        <div className="fgp-stat-card" role="listitem">
          <div
            className="fgp-stat-icon"
            style={{ background: '#fce4ec', color: '#e63946' }}
            aria-hidden="true"
          >
            <Clock size={24} aria-hidden="true" />
          </div>
          <div className="fgp-stat-info">
            <div className="fgp-stat-value">{pendingCount + runningCount}</div>
            <div className="fgp-stat-label">Pending Shares</div>
          </div>
        </div>
      </div>

      <div className="fgp-section">
        <div className="fgp-section-header">
          <h3>Platforms</h3>
        </div>
        <div className="fgp-platform-stats" role="list" aria-label="Platform lists">
          <div className="fgp-platform-stat" style={{ borderColor: '#1877f2' }} role="listitem">
            <div className="fgp-platform-icon" style={{ background: '#1877f2' }} aria-hidden="true">
              FB
            </div>
            <div>{fbLists} lists</div>
          </div>
          <div className="fgp-platform-stat" style={{ borderColor: '#25d366' }} role="listitem">
            <div className="fgp-platform-icon" style={{ background: '#25d366' }} aria-hidden="true">
              WA
            </div>
            <div>{waLists} lists</div>
          </div>
          <div className="fgp-platform-stat" style={{ borderColor: '#0084ff' }} role="listitem">
            <div className="fgp-platform-icon" style={{ background: '#0084ff' }} aria-hidden="true">
              MS
            </div>
            <div>{msLists} lists</div>
          </div>
        </div>
      </div>

      <div className="fgp-section">
        <div className="fgp-section-header">
          <h3>Quick Sync</h3>
        </div>
        <div className="fgp-action-buttons">
          <button
            className="fgp-btn fgp-btn-secondary"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <Settings size={18} aria-hidden="true" /> Manage Lists
          </button>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={() => openAndSync('https://web.whatsapp.com', 'SYNC_WHATSAPP_GROUPS')}
          >
            <Users size={18} aria-hidden="true" /> Sync WhatsApp
          </button>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={() => openAndSync('https://messenger.com', 'SYNC_MESSENGER_GROUPS')}
          >
            <Users size={18} aria-hidden="true" /> Sync Messenger
          </button>
        </div>
      </div>

      <div className="fgp-section">
        <div className="fgp-section-header">
          <h3>Open Platforms</h3>
        </div>
        <div className="fgp-action-buttons">
          <button
            className="fgp-btn fgp-btn-secondary"
            onClick={() => chrome.tabs.create({ url: 'https://facebook.com' })}
          >
            <Send size={18} aria-hidden="true" /> Open Facebook
          </button>
          <button
            className="fgp-btn fgp-btn-secondary"
            onClick={() => chrome.tabs.create({ url: 'https://web.whatsapp.com' })}
          >
            <Send size={18} aria-hidden="true" /> Open WhatsApp
          </button>
          <button
            className="fgp-btn fgp-btn-secondary"
            onClick={() => chrome.tabs.create({ url: 'https://messenger.com' })}
          >
            <Send size={18} aria-hidden="true" /> Open Messenger
          </button>
        </div>
      </div>

      {runningCount > 0 && (
        <div className="fgp-section">
          <div className="fgp-section-header">
            <h3>Currently Running</h3>
          </div>
          <div className="fgp-running-list" role="list" aria-label="Running shares">
            {scheduledShares
              .filter(s => s && s.status === 'running')
              .map(share => (
                <div
                  key={share.id}
                  className="fgp-running-item"
                  role="listitem"
                  aria-label={`Sharing to groups: ${share.progress?.completedGroups || 0} of ${share.progress?.totalGroups || 0} completed`}
                >
                  <div className="fgp-running-info">
                    <div className="fgp-running-title">Sharing to groups...</div>
                    <div className="fgp-running-meta">
                      {share.progress?.completedGroups || 0} / {share.progress?.totalGroups || 0}{' '}
                      groups
                    </div>
                  </div>
                  <div
                    className="fgp-progress-bar"
                    role="progressbar"
                    aria-valuenow={
                      share.progress?.totalGroups
                        ? Math.round(
                            (share.progress.completedGroups / share.progress.totalGroups) * 100
                          )
                        : 0
                    }
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Share progress"
                  >
                    <div
                      className="fgp-progress-fill"
                      style={{
                        width: `${share.progress?.totalGroups ? (share.progress.completedGroups / share.progress.totalGroups) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListsTab({ state }: { state: PopupState }) {
  const [filterPlatform, setFilterPlatform] = useState<GroupList['platform'] | 'all'>('all');

  const filteredLists =
    filterPlatform === 'all'
      ? state.groupLists
      : state.groupLists.filter(l => l.platform === filterPlatform);

  const platformColors: Record<string, string> = {
    facebook: '#1877f2',
    whatsapp: '#25d366',
    messenger: '#0084ff',
  };

  return (
    <div
      className="fgp-tab-content"
      role="tabpanel"
      id="panel-lists"
      aria-labelledby="tab-lists"
      tabIndex={0}
    >
      <div className="fgp-section-header">
        <h3>Group Lists</h3>
        <div className="fgp-filter-row">
          <label htmlFor="platform-filter" className="fgp-sr-only">
            Filter by platform
          </label>
          <select
            id="platform-filter"
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value as GroupList['platform'] | 'all')}
            className="fgp-select fgp-select-sm"
          >
            <option value="all">All Platforms</option>
            <option value="facebook">Facebook</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
          </select>
          <button
            className="fgp-btn fgp-btn-sm fgp-btn-primary"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <Plus size={16} aria-hidden="true" /> New List
          </button>
        </div>
      </div>
      {filteredLists.length === 0 ? (
        <div className="fgp-empty-state">
          <Users size={48} aria-hidden="true" />
          <p>
            {filterPlatform === 'all' ? 'No group lists yet' : `No ${filterPlatform} lists yet`}
          </p>
          <button
            className="fgp-btn fgp-btn-primary"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            Create your first list
          </button>
        </div>
      ) : (
        <div className="fgp-list-grid" role="list" aria-label="Group lists">
          {filteredLists.map(list => (
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
                style={{ color: platformColors[list.platform] || '#666' }}
              >
                {list.platform === 'facebook'
                  ? 'Facebook'
                  : list.platform === 'whatsapp'
                    ? 'WhatsApp'
                    : 'Messenger'}
              </div>
              <div className="fgp-list-actions">
                <button
                  className="fgp-btn-icon"
                  aria-label={`Share to ${list.name}`}
                  title="Share to this list"
                >
                  <Send size={16} aria-hidden="true" />
                </button>
                <button className="fgp-btn-icon" aria-label={`Edit ${list.name}`} title="Edit">
                  <Edit size={16} aria-hidden="true" />
                </button>
                <button className="fgp-btn-icon" aria-label={`Delete ${list.name}`} title="Delete">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduledTab({ state }: { state: PopupState }) {
  const scheduledShares = isScheduledShareArray(state.scheduledShares) ? state.scheduledShares : [];

  const pending = scheduledShares.filter(s => s.status === 'pending');
  const running = scheduledShares.filter(s => s.status === 'running');

  return (
    <div
      className="fgp-tab-content"
      role="tabpanel"
      id="panel-scheduled"
      aria-labelledby="tab-scheduled"
      tabIndex={0}
    >
      <div className="fgp-section-header">
        <h3>Scheduled Shares</h3>
      </div>
      {pending.length === 0 && running.length === 0 ? (
        <div className="fgp-empty-state">
          <Clock size={48} aria-hidden="true" />
          <p>No scheduled shares</p>
        </div>
      ) : (
        <div className="fgp-scheduled-list" role="list" aria-label="Scheduled shares">
          {running.map(share => (
            <div
              key={share.id}
              className="fgp-scheduled-item running"
              role="listitem"
              aria-label={`Running: ${share.postPreview.authorName}, ${share.progress?.completedGroups || 0} of ${share.progress?.totalGroups || 0} groups completed`}
            >
              <div className="fgp-scheduled-info">
                <div className="fgp-scheduled-title">Running: {share.postPreview.authorName}</div>
                <div className="fgp-scheduled-meta">
                  {share.progress?.completedGroups || 0} / {share.progress?.totalGroups || 0} groups
                </div>
              </div>
              <div
                className="fgp-progress-bar"
                role="progressbar"
                aria-valuenow={
                  share.progress?.totalGroups
                    ? Math.round(
                        (share.progress.completedGroups / share.progress.totalGroups) * 100
                      )
                    : 0
                }
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Share progress"
              >
                <div
                  className="fgp-progress-fill"
                  style={{
                    width: `${share.progress?.totalGroups ? (share.progress.completedGroups / share.progress.totalGroups) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          {pending.map(share => (
            <div
              key={share.id}
              className="fgp-scheduled-item pending"
              role="listitem"
              aria-label={`Pending: ${share.postPreview.authorName}, scheduled for ${formatTime(share.scheduledAt)}`}
            >
              <div className="fgp-scheduled-info">
                <div className="fgp-scheduled-title">{share.postPreview.authorName}</div>
                <div className="fgp-scheduled-meta">
                  <Calendar size={14} aria-hidden="true" /> {formatTime(share.scheduledAt)}
                </div>
              </div>
              <div className="fgp-scheduled-actions">
                <button
                  className="fgp-btn-icon"
                  aria-label={`Cancel scheduled share for ${share.postPreview.authorName}`}
                  title="Cancel"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ state }: { state: PopupState }) {
  const completed = (state.shareHistory || []).filter(s => s.status === 'completed').slice(0, 20);
  const failed = (state.shareHistory || []).filter(s => s.status === 'failed').slice(0, 10);

  return (
    <div
      className="fgp-tab-content"
      role="tabpanel"
      id="panel-history"
      aria-labelledby="tab-history"
      tabIndex={0}
    >
      <div className="fgp-section-header">
        <h3>Recent History</h3>
      </div>
      {completed.length === 0 && failed.length === 0 ? (
        <div className="fgp-empty-state">
          <CheckCircle size={48} aria-hidden="true" />
          <p>No sharing history yet</p>
        </div>
      ) : (
        <div className="fgp-history-list" role="list" aria-label="Share history">
          {completed.map(share => (
            <div
              key={share.id}
              className="fgp-history-item success"
              role="listitem"
              aria-label={`${share.settings.mode === 'share_original' ? 'Shared' : 'Posted as me'} to ${share.progress?.successfulGroups || 0} groups ${formatRelativeTime(share.completedAt || share.startedAt)}`}
            >
              <div className="fgp-history-icon success" aria-hidden="true">
                <CheckCircle size={20} />
              </div>
              <div className="fgp-history-info">
                <div className="fgp-history-title">
                  {share.settings.mode === 'share_original' ? 'Shared' : 'Posted as me'}
                </div>
                <div className="fgp-history-meta">
                  {share.progress?.successfulGroups || 0} groups •
                  {formatRelativeTime(share.completedAt || share.startedAt)}
                </div>
              </div>
            </div>
          ))}
          {failed.map(share => (
            <div
              key={share.id}
              className="fgp-history-item failed"
              role="listitem"
              aria-label={`Failed to share to ${share.progress?.failedGroups || 0} groups ${formatRelativeTime(share.completedAt || share.startedAt)}`}
            >
              <div className="fgp-history-icon failed" aria-hidden="true">
                <AlertCircle size={20} />
              </div>
              <div className="fgp-history-info">
                <div className="fgp-history-title">Failed</div>
                <div className="fgp-history-meta">
                  {share.progress?.failedGroups || 0} groups •
                  {formatRelativeTime(share.completedAt || share.startedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ state }: { state: PopupState }) {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(state.userSettings.theme);

  return (
    <div
      className="fgp-tab-content"
      role="tabpanel"
      id="panel-settings"
      aria-labelledby="tab-settings"
      tabIndex={0}
    >
      <div className="fgp-section">
        <h3>Appearance</h3>
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

      <div className="fgp-section">
        <h3>Data Management</h3>
        <div className="fgp-action-buttons">
          <button className="fgp-btn fgp-btn-secondary" onClick={exportData}>
            <Download size={18} aria-hidden="true" /> Export Data
          </button>
          <button className="fgp-btn fgp-btn-secondary" onClick={importData}>
            <Upload size={18} aria-hidden="true" /> Import Data
          </button>
          <button className="fgp-btn fgp-btn-danger" onClick={clearAllData}>
            <Trash2 size={18} aria-hidden="true" /> Clear All Data
          </button>
        </div>
      </div>

      <div className="fgp-section">
        <h3>About</h3>
        <div className="fgp-about">
          <p>
            <strong>Free Group Poster</strong> v1.0.0
          </p>
          <p>Free, open-source Chrome extension for sharing posts to multiple Facebook groups.</p>
          <p>Built with ❤️ for the community. No tracking, no ads, fully local.</p>
          <a
            href="https://github.com/free-group-poster/free-group-poster"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
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

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const text = await file.text();
      await chrome.runtime.sendMessage({ type: 'IMPORT_DATA', data: text });
      alert('Data imported successfully!');
    }
  };
  input.click();
}

async function clearAllData() {
  if (confirm('This will delete ALL your groups, lists, history, and settings. Are you sure?')) {
    await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
    alert('All data cleared!');
  }
}

function TabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: PopupState['activeTab'];
  setActiveTab: (tab: PopupState['activeTab']) => void;
}) {
  const tabs: Array<{ id: PopupState['activeTab']; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Users size={18} aria-hidden="true" /> },
    { id: 'lists', label: 'Lists', icon: <Send size={18} aria-hidden="true" /> },
    { id: 'scheduled', label: 'Scheduled', icon: <Clock size={18} aria-hidden="true" /> },
    { id: 'history', label: 'History', icon: <CheckCircle size={18} aria-hidden="true" /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} aria-hidden="true" /> },
  ];

  return (
    <div className="fgp-tab-bar" role="tablist" aria-label="Main navigation">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          id={`tab-${tab.id}`}
          className={`fgp-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function App() {
  const [state, setState] = useState<PopupState>({
    activeTab: 'dashboard',
    groupLists: [],
    scheduledShares: [],
    shareHistory: [],
    userSettings: {
      theme: 'system',
      language: 'en',
      showShareButton: true,
      shareButtonPosition: 'after_share',
      autoDetectGroups: true,
      confirmBeforeShare: true,
      soundNotifications: true,
      desktopNotifications: true,
      analyticsOptIn: false,
    },
    dailyPosts: 0,
    loading: true,
  });

  const setActiveTab = (tab: PopupState['activeTab']) => {
    setState(s => ({ ...s, activeTab: tab }));
  };

  // Focus management for tab switching
  const tabPanelRefs = useRef<Record<string, HTMLDivElement | null>>({
    dashboard: null,
    lists: null,
    scheduled: null,
    history: null,
    settings: null,
  });

  useEffect(() => {
    const panel = tabPanelRefs.current[state.activeTab];
    if (panel) {
      panel.focus();
    }
  }, [state.activeTab]);

  function unwrap<T>(res: { success: boolean; data?: T; error?: string }): T | undefined {
    if (!res?.success) {
      console.error('Message failed:', res?.error);
      return undefined;
    }
    return res.data;
  }

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const [groupListsRes, scheduledSharesRes, shareHistoryRes, userSettingsRes, dailyPostsRes] =
        await Promise.all([
          chrome.runtime.sendMessage({ type: 'GET_GROUP_LISTS' }),
          chrome.runtime.sendMessage({ type: 'GET_ALL_SCHEDULED' }),
          chrome.runtime.sendMessage({ type: 'GET_SHARE_HISTORY' }),
          chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' }),
          chrome.runtime.sendMessage({ type: 'GET_DAILY_POSTS' }),
        ]);

      const groupLists = unwrap(groupListsRes) || [];
      const scheduledShares = unwrap(scheduledSharesRes) || [];
      const shareHistory = unwrap(shareHistoryRes) || [];
      const userSettings = unwrap(userSettingsRes);
      const dailyPosts = unwrap(dailyPostsRes) ?? 0;

      setState(s => ({
        ...s,
        groupLists,
        scheduledShares,
        shareHistory,
        userSettings: userSettings || s.userSettings,
        dailyPosts,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to load data:', error);
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const renderTab = () => {
    switch (state.activeTab) {
      case 'dashboard':
        return <Dashboard state={state} refresh={refresh} />;
      case 'lists':
        return <ListsTab state={state} />;
      case 'scheduled':
        return <ScheduledTab state={state} />;
      case 'history':
        return <HistoryTab state={state} />;
      case 'settings':
        return <SettingsTab state={state} />;
    }
  };

  return (
    <div className="fgp-popup">
      <div className="fgp-header">
        <div className="fgp-logo">
          <Users size={24} aria-hidden="true" />
          <span>Free Group Poster</span>
        </div>
        <div className="fgp-version">v1.0.0</div>
      </div>
      <TabBar activeTab={state.activeTab} setActiveTab={setActiveTab} />
      <div className="fgp-content" role="main">
        {state.loading ? (
          <div className="fgp-loading" role="status" aria-live="polite">
            Loading...
          </div>
        ) : (
          renderTab()
        )}
      </div>
    </div>
  );
}

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
