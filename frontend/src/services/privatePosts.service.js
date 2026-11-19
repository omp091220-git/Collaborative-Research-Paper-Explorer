import api from "./api";
const path = (id) => `/posts/workspace/${encodeURIComponent(id)}`;
export default {
  async list(params, signal) {
    return (await api.get("/posts/workspace", { params, signal })).data;
  },
  async detail(id, signal) {
    return (await api.get(path(id), { signal })).data.post;
  },
  async create(body) {
    return (await api.post("/posts", { ...body, visibility: "PRIVATE" })).data
      .post;
  },
  async edit(id, body) {
    return (await api.patch(path(id), body)).data.post;
  },
  async permissions(id, signal) {
    return (
      await api.get(`/posts/${encodeURIComponent(id)}/permissions`, { signal })
    ).data.permissions;
  },
  async grant(id, body) {
    return (await api.put(`/posts/${encodeURIComponent(id)}/permissions`, body))
      .data;
  },
  async revoke(id, userId) {
    return (
      await api.delete(
        `/posts/${encodeURIComponent(id)}/permissions/${encodeURIComponent(userId)}`,
      )
    ).data;
  },
};
