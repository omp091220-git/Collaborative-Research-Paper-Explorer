import React, { useState } from 'react';

/**
 * Renders a single extracted asset (figure, chart, or table) with its thumbnail,
 * caption, page number and type.
 */
export default function AssetItem({ paperId, asset }) {
  const { id, asset_type, page_number, caption } = asset;
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const src = `/api/papers/${paperId}/assets/${id}`;

  return (
    <div className="asset-item border border-theme-subtle rounded-xl overflow-hidden bg-theme-card shadow-xs">
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${asset_type || 'asset'} from page ${page_number}`}
        className="block"
      >
        <img
          src={src}
          alt={`${asset_type} on page ${page_number}`}
          className="w-full h-48 object-contain bg-theme-elevated"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = '/placeholder.png';
          }}
        />
      </a>
      <div className="p-3 text-xs">
        <div className="font-bold text-violet-400">{asset_type?.toUpperCase() || 'ASSET'}</div>
        <div className="text-theme-muted mt-0.5">Page {page_number}</div>
        {typeof caption === 'string' && caption && (
          <>
            <div className={`mt-1 text-theme-secondary break-words ${captionExpanded ? '' : 'line-clamp-2'}`}>
              {caption}
            </div>
            {caption.length > 160 && (
              <button
                type="button"
                onClick={() => setCaptionExpanded((expanded) => !expanded)}
                className="mt-1 text-[11px] font-medium text-violet-400 hover:text-violet-300"
                aria-expanded={captionExpanded}
              >
                {captionExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
