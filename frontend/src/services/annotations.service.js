import api from './api';

export const annotationsService = {
  async getAnnotations(paperId) {
    const url = paperId ? `/annotations?paper_id=${encodeURIComponent(paperId)}` : '/annotations';
    const res = await api.get(url);
    return res.data?.annotations || [];
  },

  async createAnnotation(annotationData) {
    const res = await api.post('/annotations', annotationData);
    return res.data;
  },

  async updateAnnotation(id, updateData) {
    const res = await api.patch(`/annotations/${id}`, updateData);
    return res.data;
  },

  async deleteAnnotation(id) {
    const res = await api.delete(`/annotations/${id}`);
    return res.data;
  },
};

export default annotationsService;
