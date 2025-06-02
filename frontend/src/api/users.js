import axios from 'axios';

export const fetchUser = async (id) => {
  const res = await axios.get(`/api/users/${id}`);
  return res.data;
};

export const updateUser = async (id, data) => {
  return axios.put(`/api/users/${id}`, data);
};

export const fetchUserHistory = async (id) => {
  const res = await axios.get(`/api/users/${id}/history`);
  return res.data;
};
