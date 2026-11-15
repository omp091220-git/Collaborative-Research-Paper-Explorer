import React from 'react';

/**
 * Renders a single extracted asset (figure, chart, or table) with its thumbnail,
 * caption, page number and type.
 *
 * Props:
 *  - paperId: string – ID of the paper the asset belongs to.
 *  - asset: object – Asset record returned by the backend `listAssets` endpoint.
 *      Expected fields: id, asset_type, page_number, caption, thumbnail_path (optional).
 */
export default function AssetItem({ paperId, asset }) {
  const { id, asset_type, page_number, caption, thumbnail_path } = asset;
  // Construct URL for binary asset. Backend serves raw asset bytes at
  // GET /api/papers/:paperId/assets/:assetId
  const src = `/api/papers/${paperId}/assets/${id}`;

  return (
    <div className="asset-item border rounded-md overflow-hidden bg-white shadow-sm">
      <img
        src={src}
        alt={`${asset_type} on page ${page_number}`}
        className="w-full h-48 object-contain bg-gray-100"
        loading="lazy"
        onError={(e) => {
          // Fallback to a placeholder if the image cannot be loaded
          e.target.src = '/placeholder.png';
        }}
      />
      <div className="p-2 text-sm">
        <div className="font-medium">{asset_type?.toUpperCase() || 'ASSET'}</div>
        <div className="text-gray-600">Page {page_number}</div>
        {caption && <div className="mt-1 text-gray-800">{caption}</div>}
      </div>
    </div>
  );
}

