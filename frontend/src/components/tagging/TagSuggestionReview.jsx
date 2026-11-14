import React, { useEffect, useState } from 'react';
import { getTagSuggestions, acceptSuggestion, rejectSuggestion } from '../../services/tagSuggestions.service.js';
import TagBadge from '../common/TagBadge.jsx';

/**
 * Simple UI for reviewing AI‑generated tag suggestions.
 * - Lists pending suggestions for the current paper.
 * - Shows duplicate warning if `duplicate_check_status` indicates a potential duplicate.
 * - Allows the user to accept (private or request global) or reject each suggestion.
 */
const TagSuggestionReview = ({ paperId, userId }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = async () => {
    setLoading(true);
    const data = await getTagSuggestions(paperId);
    setSuggestions(data.suggestions || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSuggestions();
  }, [paperId]);

  const handleAccept = async (id, visibility) => {
    await acceptSuggestion(id, userId, visibility);
    fetchSuggestions();
  };

  const handleReject = async (id) => {
    await rejectSuggestion(id, userId, 'Not needed');
    fetchSuggestions();
  };

  if (loading) return <div>Loading suggestions…</div>;
  if (!suggestions.length) return <div>No suggestions available.</div>;

  return (
    <div className="tag-suggestion-review">
      <h3>AI Tag Suggestions</h3>
      <ul>
        {suggestions.map((s) => (
          <li key={s.id} className="suggestion-item">
            <TagBadge name={s.suggested_name} />
            {s.duplicate_check_status !== 'CLEAN' && (
              <div className="duplicate-warning">
                Possible duplicate – review before accepting.
              </div>
            )}
            <button onClick={() => handleAccept(s.id, 'PRIVATE')}>Accept Private</button>
            <button onClick={() => handleAccept(s.id, 'GLOBAL')}>Request Global</button>
            <button onClick={() => handleReject(s.id)}>Reject</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TagSuggestionReview;
