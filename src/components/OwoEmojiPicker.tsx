import { Button, Empty, Grid, Input, Modal, Popover, Spin, Tabs, theme } from 'antd';
import { Smile } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useTwikooOwo } from '../hooks/useTwikooOwo';
import type { TwikooOwoItem } from '../lib/twikooOwo';

export interface OwoEmojiPickerProps {
  onInsert: (placeholder: string) => void;
  disabled?: boolean;
  /** Ant Button size for the trigger */
  buttonSize?: 'small' | 'middle' | 'large';
}

function formatPlaceholder(text: string): string {
  return `[:${text}]`;
}

const GRID_MAX_H = 280;
const CELL = 40;
const GAP = 6;
const PANEL_MAX_W = 320;
const { useBreakpoint } = Grid;

const OwoEmojiPicker: React.FC<OwoEmojiPickerProps> = ({
  onInsert,
  disabled,
  buttonSize = 'middle',
}) => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const { t } = useI18n();
  const { ready, error, items, packs } = useTwikooOwo();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activePackKey, setActivePackKey] = useState<string>('');

  useEffect(() => {
    if (packs.length === 0) return;
    setActivePackKey((k) => {
      if (k && packs.some((p) => p.packName === k)) return k;
      return packs[0]!.packName;
    });
  }, [packs]);

  const searchMode = query.trim().length > 0;

  const filteredSearch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter(
      (it) =>
        it.packName.toLowerCase().includes(q) ||
        it.text.toLowerCase().includes(q)
    );
  }, [items, query]);

  const handlePick = useCallback(
    (it: TwikooOwoItem) => {
      onInsert(formatPlaceholder(it.text));
      setOpen(false);
      setQuery('');
    },
    [onInsert]
  );

  const panelWidth = `min(${PANEL_MAX_W}px, calc(100vw - 24px))`;
  const gridMaxHeight = 'min(280px, calc(100vh - 320px))';

  const renderEmojiGrid = (list: TwikooOwoItem[]) => (
    <div
      style={{
        maxHeight: gridMaxHeight,
        overflowY: 'auto',
        display: 'flex',
        flexWrap: 'wrap',
        gap: GAP,
        alignContent: 'flex-start',
      }}
    >
      {list.map((it) => (
        <button
          key={`${it.packName}:${it.text}`}
          type="button"
          title={`${it.packName} · ${formatPlaceholder(it.text)}`}
          onClick={() => handlePick(it)}
          style={{
            width: CELL,
            height: CELL,
            padding: 2,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusSM,
            background: token.colorBgContainer,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <img
            src={it.icon}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              verticalAlign: 'middle',
            }}
          />
        </button>
      ))}
    </div>
  );

  const packTabItems = packs.map((p) => ({
    key: p.packName,
    label: (
      <span
        title={p.packName}
        style={{
          display: 'inline-block',
          maxWidth: 96,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          verticalAlign: 'bottom',
        }}
      >
        {p.packName}
      </span>
    ),
    children: renderEmojiGrid(p.items),
  }));

  const body = (
    <div
      style={{
        width: screens.md ? panelWidth : '100%',
        maxWidth: '100%',
      }}
    >
      <Input.Search
        allowClear
        placeholder={t('owo.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div
        style={{
          maxHeight: 'min(420px, calc(100vh - 180px))',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {!ready && !error && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        )}
        {error && (
          <Empty
            description={t('owo.loadFailed')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
        {ready && !error && searchMode && filteredSearch.length === 0 && (
          <Empty description={t('owo.noMatch')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {ready && !error && searchMode && filteredSearch.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                color: token.colorTextSecondary,
                marginBottom: 8,
              }}
            >
              {t('owo.searchResult', { count: filteredSearch.length })}
            </div>
            {renderEmojiGrid(filteredSearch)}
          </div>
        )}
        {ready && !error && !searchMode && packs.length === 0 && (
          <Empty description={t('owo.emptyPack')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {ready && !error && !searchMode && packs.length > 0 && (
          <Tabs
            size="small"
            activeKey={activePackKey}
            onChange={setActivePackKey}
            destroyInactiveTabPane
            tabBarStyle={{ marginBottom: 8 }}
            style={{ marginBottom: 0 }}
            items={packTabItems}
          />
        )}
      </div>
    </div>
  );

  if (!screens.md) {
    return (
      <>
        <Button
          type="text"
          size={buttonSize}
          disabled={disabled}
          icon={<Smile size={20} />}
          aria-label={t('owo.insertTitle')}
          style={{ color: token.colorTextSecondary, flexShrink: 0 }}
          onClick={() => setOpen(true)}
        />
        <Modal
          title={t('owo.insertTitle')}
          open={open}
          onCancel={() => {
            setOpen(false);
            setQuery('');
          }}
          footer={null}
          destroyOnHidden
          centered
          width="calc(100vw - 16px)"
          styles={{ body: { padding: 12 } }}
        >
          {body}
        </Modal>
      </>
    );
  }

  return (
    <Popover
      content={body}
      title={t('owo.insertTitle')}
      trigger="click"
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
      placement="topLeft"
    >
      <Button
        type="text"
        size={buttonSize}
        disabled={disabled}
        icon={<Smile size={20} />}
        aria-label={t('owo.insertTitle')}
        style={{ color: token.colorTextSecondary, flexShrink: 0 }}
      />
    </Popover>
  );
};

export default OwoEmojiPicker;
