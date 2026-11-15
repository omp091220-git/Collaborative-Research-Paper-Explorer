import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import AssetItem from './AssetItem';

/**
 * AssetSection component
 *
 * Props:
 *   - paperId: string – the identifier of the paper.
 *   - initialStatus?: string – optional pre-fetched extraction status.
 *
 * It polls the extraction status every 5 seconds while the job is in
 * `queued` or `processing` state. When the status becomes `completed`, it
 * fetches the list of assets and displays them.
 */
export default function AssetSection({ paperId }) {
  const [status, setStatus] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`/api/papers/${paperId}/extraction-status`, {
        withCredentials: true,
      });
      // Backend returns { status: 'queued'|'processing'|'completed'|'failed', job: {...} }
      setStatus(res.data.status);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load extraction status');
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchAssets = async () => {
    setLoadingAssets(true);
    try {
      const res = await axios.get(`/api/papers/${paperId}/assets`, {
        withCredentials: true,
      });
      setAssets(res.data.assets || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  // Initial load & status polling
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingStatus(true);
      await fetchStatus();
    };
    load();

    // Setup polling for queued/processing
    const startPolling = () => {
      if (pollRef.current) return; // already polling
      pollRef.current = setInterval(async () => {
        if (!active) return;
        await fetchStatus();
      }, 5000);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    // Manage polling based on status changes
    if (status === 'queued' || status === 'processing') {
      startPolling();
    } else {
      stopPolling();
    }

    // When status becomes completed, load assets
    if (status === 'completed') {
      fetchAssets();
    }

    return () => {
      active = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, status]);

  // Render UI
  if (loadingStatus) {
    return (
      <div className="p-4 text-sm text-gray-600">Loading extraction status...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">{error}</div>
    );
  }

  return (
    <div className="asset-section border-t pt-4 mt-4">
      <h3 className="text-lg font-semibold mb-2">Extraction Status: {status?.toUpperCase()}</h3>
      {status === 'completed' && (
        <>
          {loadingAssets ? (
            <div className="text-sm text-gray-600">Loading assets...</div>
          ) : assets.length > 0 ? (
            <div className="asset-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <AssetItem key={asset.id} paperId={paperId} asset={asset} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No assets extracted.</div>
          )}
        </>
      )}
      {status === 'failed' && (
        <div className="text-sm text-red-600">Extraction failed. Please try again later.</div>
      )}
      {(status === 'queued' || status === 'processing') && (
        <div className="text-sm text-gray-600">Extraction is {status}...</div>
      )}
    </div>
  );
}

