import api from './api';

export const researcherService = {
  /**
   * FR-37 — Search researchers by name.
   * @param {string} query - at least 2 characters
   * @param {number} limit - max results (default 20)
   */
  async searchResearchers(query, limit = 20) {
    const res = await api.get('/researchers/search', {
      params: { q: query, limit },
    });
    return res.data; // { researchers: [...], total: N }
  },

  /**
   * FR-38 — Get a researcher's public profile + publications.
   * @param {string} id - UUID of the researcher
   */
  async getResearcherProfile(id) {
    const res = await api.get(`/researchers/${id}/profile`);
    return res.data?.researcher ?? null;
  },

  /**
   * FR-39 — Get stored publications for a researcher.
   * @param {string} id - UUID of the researcher
   */
  async getResearcherPublications(id) {
    const res = await api.get(`/researchers/${id}/publications`);
    return res.data;
  },

  /**
   * FR-39 — Trigger external publication discovery for a researcher.
   * @param {string} id - UUID of the researcher
   */
  async discoverPublications(id) {
    const res = await api.post(`/researchers/${id}/publications/discover`);
    return res.data;
  },
};

export default researcherService;
