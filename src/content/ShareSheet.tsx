/**
 * Share Sheet React Component
 * Main UI for selecting groups, adding captions, and sharing
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { PostPreview, ShareSettings, GroupList } from '../shared/types';

interface ShareSheetProps {
  preview: PostPreview;
  groupLists: GroupList[];
  onClose: () => void;
  onShare: (
    preview: PostPreview,
    groups: Array<{ id: string; name: string }>,
    settings: ShareSettings
  ) => Promise<void>;
  onSchedule: (
    preview: PostPreview,
    groups: Array<{ id: string; name: string }>,
    settings: ShareSettings,
    scheduledAt: number
  ) => Promise<void>;
}

export function ShareSheet({ preview, groupLists, onClose, onShare, onSchedule }: ShareSheetProps) {
  // State
  const [mode, setMode] = useState<'share_original' | 'repost_content'>('share_original');
  const [caption, setCaption] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [safetyLevel, setSafetyLevel] = useState<'fast' | 'balanced' | 'safe'>('balanced');
  const [overnightPause, setOvernightPause] = useState(true);
  const [overnightStart, setOvernightStart] = useState('22:00');
  const [overnightEnd, setOvernightEnd] = useState('07:00');
  const [maxPostsPerDay, setMaxPostsPerDay] = useState(200);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupsForList, setGroupsForList] = useState<Array<{ id: string; name: string }>>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Must be declared before the effect below: referencing it in that effect's
  // dependency array would hit the temporal dead zone and crash the sheet.
  const loadGroupsForList = useCallback(async (listId: string) => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_GROUPS_FOR_LIST', listId });
      const groups: Array<{ id: string; name: string }> = response?.data ?? [];
      setGroupsForList(groups.map(g => ({ id: g.id, name: g.name })));
    } catch (error) {
      console.error('Failed to load groups:', error);
      setGroupsForList([]);
    }
  }, []);

  // Load groups when list selection changes. With no lists yet, fall back to every
  // synced group so sharing works straight after a sync instead of showing an empty box.
  useEffect(() => {
    if (selectedListId) {
      loadGroupsForList(selectedListId);
      return;
    }
    let cancelled = false;
    chrome.runtime
      .sendMessage({ type: 'GET_ALL_GROUPS' })
      .then((response: { data?: Array<{ id: string; name: string }> } | undefined) => {
        if (cancelled) return;
        setGroupsForList((response?.data ?? []).map(g => ({ id: g.id, name: g.name })));
      })
      .catch(() => {
        if (!cancelled) setGroupsForList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedListId, loadGroupsForList]);

  // Auto-select first list on mount
  useEffect(() => {
    if (groupLists.length > 0 && !selectedListId) {
      setSelectedListId(groupLists[0].id);
    }
  }, [groupLists, selectedListId]);

  const handleListSelect = useCallback((listId: string) => {
    setSelectedListId(listId);
  }, []);

  const handleGroupToggle = useCallback((group: { id: string; name: string }) => {
    setSelectedGroups(prev => {
      const exists = prev.some(g => g.id === group.id);
      if (exists) {
        return prev.filter(g => g.id !== group.id);
      }
      return [...prev, group];
    });
  }, []);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const filteredGroups = groupsForList.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const collectSettings = useCallback(
    (): ShareSettings => ({
      mode,
      caption,
      firstComment,
      useSpintax: caption.includes('{') && caption.includes('|'),
      delayBetweenGroups:
        safetyLevel === 'fast' ? 30000 : safetyLevel === 'balanced' ? 60000 : 120000,
      safetyLevel,
      overnightPause,
      overnightStart,
      overnightEnd,
      maxPostsPerDay,
    }),
    [
      mode,
      caption,
      firstComment,
      safetyLevel,
      overnightPause,
      overnightStart,
      overnightEnd,
      maxPostsPerDay,
    ]
  );

  const handleShareClick = useCallback(async () => {
    if (selectedGroups.length === 0) {
      alert('Please select at least one group');
      return;
    }
    setIsSharing(true);
    const settings = collectSettings();
    await onShare(preview, selectedGroups, settings);
    onClose();
    setIsSharing(false);
  }, [selectedGroups, collectSettings, preview, onShare, onClose]);

  const handleScheduleClick = useCallback(async () => {
    if (selectedGroups.length === 0) {
      alert('Please select at least one group');
      return;
    }
    const input = prompt('Enter date/time (YYYY-MM-DD HH:MM) or "in X minutes/hours":');
    if (!input) return;

    let scheduledAt: number | null = null;
    if (input.startsWith('in ')) {
      const match = input.match(/in (\d+) (minute|hour)s?/i);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        scheduledAt = Date.now() + (unit === 'minute' ? value * 60 * 1000 : value * 60 * 60 * 1000);
      }
    } else {
      const date = new Date(input);
      if (!isNaN(date.getTime())) {
        scheduledAt = date.getTime();
      }
    }

    if (!scheduledAt) {
      alert('Invalid format. Use YYYY-MM-DD HH:MM or "in X minutes"');
      return;
    }

    setIsSharing(true);
    const settings = collectSettings();
    await onSchedule(preview, selectedGroups, settings, scheduledAt);
    onClose();
    setIsSharing(false);
  }, [selectedGroups, collectSettings, preview, onSchedule, onClose]);

  // Render post preview
  const renderPreview = () => (
    <div className="fgp-preview">
      <div className="fgp-preview-header">
        <img
          src={
            preview.authorProfileUrl ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ddd"/></svg>'
          }
          alt=""
          className="fgp-preview-avatar"
        />
        <div>
          <div className="fgp-preview-author">{preview.authorName}</div>
          <div className="fgp-preview-meta">Original post</div>
        </div>
      </div>
      {preview.text && (
        <div className="fgp-preview-text">
          {preview.text.slice(0, 300)}
          {preview.text.length > 300 ? '...' : ''}
        </div>
      )}
      {preview.images.length > 0 && (
        <div className="fgp-preview-images">
          {preview.images.slice(0, 4).map((img, idx) => (
            <img key={idx} src={img} alt="" className="fgp-preview-image" />
          ))}
          {preview.images.length > 4 && (
            <div className="fgp-preview-more">+{preview.images.length - 4}</div>
          )}
        </div>
      )}
      {preview.videoUrl && (
        <div className="fgp-preview-video">🎬 {preview.isReel ? 'Reel' : 'Video'} attached</div>
      )}
    </div>
  );

  // Render share mode selector
  const renderModeSelector = () => (
    <div>
      <label className="fgp-section-label">How to share</label>
      <div className="fgp-mode-buttons">
        <button
          className={`fgp-mode-btn ${mode === 'share_original' ? 'fgp-active' : ''}`}
          onClick={() => setMode('share_original')}
        >
          <div className="fgp-mode-main">Share the post</div>
          <div className="fgp-mode-sub">Keeps author & video</div>
        </button>
        <button
          className={`fgp-mode-btn ${mode === 'repost_content' ? 'fgp-active' : ''}`}
          onClick={() => setMode('repost_content')}
        >
          <div className="fgp-mode-main">Post as me</div>
          <div className="fgp-mode-sub">New post from you</div>
        </button>
      </div>
    </div>
  );

  // Render caption input
  const renderCaption = () => (
    <div style={{ marginBottom: '20px' }}>
      <label className="fgp-section-label">Add a caption (optional)</label>
      <textarea
        className="fgp-textarea"
        placeholder="What's on your mind? Use {option1|option2} for Spintax..."
        value={caption}
        onChange={e => setCaption(e.target.value)}
      />
      <div className="fgp-button-row">
        <button
          className="fgp-secondary-btn"
          onClick={() => setCaption(caption + ' {option1|option2}')}
        >
          Insert Spintax
        </button>
        <button className="fgp-secondary-btn">Use Template</button>
      </div>
    </div>
  );

  // Render first comment input
  const renderFirstComment = () => (
    <div style={{ marginBottom: '20px' }}>
      <label className="fgp-section-label">First comment (optional)</label>
      <textarea
        className="fgp-textarea fgp-textarea-sm"
        placeholder="First comment to post..."
        value={firstComment}
        onChange={e => setFirstComment(e.target.value)}
      />
    </div>
  );

  // Render group selector
  const renderGroupSelector = () => (
    <div style={{ marginBottom: '20px' }}>
      <div className="fgp-group-selector-header">
        <label className="fgp-section-label" style={{ marginBottom: 0 }}>
          Select Groups
        </label>
        <span className="fgp-group-count">{selectedGroups.length} groups selected</span>
      </div>
      <div className="fgp-group-lists">
        {groupLists.map(list => (
          <button
            key={list.id}
            className={`fgp-list-btn ${selectedListId === list.id ? 'fgp-active' : ''}`}
            onClick={() => handleListSelect(list.id)}
            style={{
              borderColor: list.color,
              color: selectedListId === list.id ? 'white' : list.color,
              background: selectedListId === list.id ? list.color : 'white',
            }}
          >
            {list.name} ({list.groupIds.length})
          </button>
        ))}
      </div>
      <input
        type="text"
        className="fgp-search-input"
        placeholder="Search groups..."
        value={searchQuery}
        onChange={handleSearch}
      />
      <div className="fgp-group-list">
        {filteredGroups.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#65676b' }}>
            {groupsForList.length === 0 ? 'No groups in this list' : 'No matching groups'}
          </div>
        ) : (
          filteredGroups.map(group => (
            <label key={group.id} className="fgp-group-item">
              <input
                type="checkbox"
                className="fgp-checkbox"
                checked={selectedGroups.some(g => g.id === group.id)}
                onChange={() => handleGroupToggle(group)}
              />
              <span className="fgp-group-name">{group.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );

  // Render advanced settings
  const renderAdvancedSettings = () => (
    <div className="fgp-advanced">
      <details
        className="fgp-details"
        open={showAdvanced}
        onToggle={() => setShowAdvanced(!showAdvanced)}
      >
        <summary className="fgp-summary">Sending Settings</summary>
        <div className="fgp-settings-grid">
          <div className="fgp-setting-group">
            <label className="fgp-setting-label">Safety Level</label>
            <div className="fgp-safety-options">
              <label className={`fgp-safety-option ${safetyLevel === 'fast' ? 'fgp-active' : ''}`}>
                <input
                  type="radio"
                  name="fgp-safety"
                  value="fast"
                  checked={safetyLevel === 'fast'}
                  onChange={() => setSafetyLevel('fast')}
                />
                Fast
              </label>
              <label
                className={`fgp-safety-option ${safetyLevel === 'balanced' ? 'fgp-active' : ''}`}
              >
                <input
                  type="radio"
                  name="fgp-safety"
                  value="balanced"
                  checked={safetyLevel === 'balanced'}
                  onChange={() => setSafetyLevel('balanced')}
                />
                Balanced
              </label>
              <label className={`fgp-safety-option ${safetyLevel === 'safe' ? 'fgp-active' : ''}`}>
                <input
                  type="radio"
                  name="fgp-safety"
                  value="safe"
                  checked={safetyLevel === 'safe'}
                  onChange={() => setSafetyLevel('safe')}
                />
                Safe
              </label>
            </div>
          </div>
          <div className="fgp-setting-group">
            <label className="fgp-setting-label">Overnight Pause</label>
            <div className="fgp-checkbox-row">
              <label className="fgp-checkbox-label">
                <input
                  type="checkbox"
                  className="fgp-checkbox"
                  checked={overnightPause}
                  onChange={e => setOvernightPause(e.target.checked)}
                />
                Enable
              </label>
              <span style={{ color: '#65676b', fontSize: '13px' }}>From</span>
              <input
                type="time"
                className="fgp-time-input"
                value={overnightStart}
                onChange={e => setOvernightStart(e.target.value)}
              />
              <span style={{ color: '#65676b', fontSize: '13px' }}>to</span>
              <input
                type="time"
                className="fgp-time-input"
                value={overnightEnd}
                onChange={e => setOvernightEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="fgp-setting-group">
            <label className="fgp-setting-label">Daily Limit</label>
            <input
              type="number"
              className="fgp-number-input"
              value={maxPostsPerDay}
              min="1"
              max="500"
              onChange={e => setMaxPostsPerDay(parseInt(e.target.value) || 200)}
            />
          </div>
        </div>
      </details>
    </div>
  );

  return (
    <div className="fgp-overlay" onClick={onClose}>
      <div className="fgp-sheet" onClick={e => e.stopPropagation()}>
        <div className="fgp-header">
          <h2>Share to Groups</h2>
          <button className="fgp-close-btn" onClick={onClose}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="fgp-content">
          {renderPreview()}
          {renderModeSelector()}
          {renderCaption()}
          {renderFirstComment()}
          {renderGroupSelector()}
          {renderAdvancedSettings()}
        </div>
        <div className="fgp-footer">
          <button className="fgp-btn fgp-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="fgp-btn fgp-schedule-btn"
            onClick={handleScheduleClick}
            disabled={isSharing}
          >
            Schedule
          </button>
          <button
            className="fgp-btn fgp-share-btn"
            onClick={handleShareClick}
            disabled={isSharing || selectedGroups.length === 0}
          >
            {isSharing ? 'Sharing...' : 'Share Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
