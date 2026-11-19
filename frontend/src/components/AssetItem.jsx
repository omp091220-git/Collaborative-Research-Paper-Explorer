import React from 'react';

/**
 * Renders a single extracted asset (figure, chart, or table) with its thumbnail,
 * caption, page number and type.
 */
export default function AssetItem({ paperId, asset }) {
  const { id, asset_type, page_number, caption } = asset;
  const src = `/api/papers/${paperId}/assets/${id}`;

  return (
    <div className="asset-item border border-theme-subtle rounded-xl overflow-hidden bg-theme-card shadow-xs">
      <img
        src={src}
        alt={`${asset_type} on page ${page_number}`}
        className="w-full h-48 object-contain bg-theme-elevated"
        loading="lazy"
        onError={(e) => {
          e.target.src = '/placeholder.png';
        }}
      />
      <div className="p-3 text-xs">
        <div className="font-bold text-violet-400">{asset_type?.toUpperCase() || 'ASSET'}</div>
        <div className="text-theme-muted mt-0.5">Page {page_number}</div>
        {caption && <div className="mt-1 text-theme-secondary line-clamp-2">{caption}</div>}
      </div>
    </div>
  );
}
