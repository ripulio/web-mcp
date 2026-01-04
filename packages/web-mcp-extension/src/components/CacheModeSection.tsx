import type {CacheMode} from '../shared.js';

export interface CacheModeSectionProps {
  cacheMode: CacheMode;
  cacheTTL: number;
  isPersistent: boolean;
  onCacheModeChange: (mode: 'none' | 'session' | 'manual' | 'persistent') => void;
  onTTLChange: (ttl: number) => void;
}

export function CacheModeSection({
  cacheMode,
  cacheTTL,
  isPersistent,
  onCacheModeChange,
  onTTLChange
}: CacheModeSectionProps) {
  return (
    <div class="settings-section">
      <h2 class="section-title">Tool Updates</h2>
      <p class="section-desc">
        Controls how tool manifests are cached when loading from package
        sources.
      </p>
      <div class="cache-options">
        <label class="cache-option">
          <input
            type="radio"
            name="cacheMode"
            checked={cacheMode === 'none'}
            onChange={() => onCacheModeChange('none')}
          />
          <span class="cache-desc">
            Check for new tool versions on every page navigation (recommended)
          </span>
        </label>
        <label class="cache-option">
          <input
            type="radio"
            name="cacheMode"
            checked={cacheMode === 'session'}
            onChange={() => onCacheModeChange('session')}
          />
          <span class="cache-desc">
            Check for new versions on browser restart
          </span>
        </label>
        <label class="cache-option">
          <input
            type="radio"
            name="cacheMode"
            checked={isPersistent}
            onChange={() => onCacheModeChange('persistent')}
          />
          <span class="cache-desc">
            Check for new versions every{' '}
            <input
              type="number"
              class="ttl-input"
              value={cacheTTL}
              min={1}
              onClick={(e) => e.stopPropagation()}
              onInput={(e) =>
                onTTLChange(
                  parseInt((e.target as HTMLInputElement).value) || 1
                )
              }
            />{' '}
            minutes
          </span>
        </label>
        <label class="cache-option">
          <input
            type="radio"
            name="cacheMode"
            checked={cacheMode === 'manual'}
            onChange={() => onCacheModeChange('manual')}
          />
          <span class="cache-desc">Manually refresh and update tools</span>
        </label>
      </div>
    </div>
  );
}
