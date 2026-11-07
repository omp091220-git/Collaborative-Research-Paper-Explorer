import api from './api';

export const recommendationsService = {
  getPaperRecommendations: async (paperId) => {
    const res = await api.get(`/recommendations/papers/${paperId}`);
    return res.data;
  },

  getSectionRecommendations: async ({ sectionText, tags, limit }) => {
    const res = await api.post('/recommendations/section', {
      section_text: sectionText,
      tags,
      limit,
    });
    return res.data;
  },

  seedSampleData: async () => {
    const res = await api.post('/recommendations/seed-sample');
    return res.data;
  },
};

export default recommendationsService;
