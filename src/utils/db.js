const API_ENDPOINT = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const REALTIME_ENDPOINT = (import.meta.env.VITE_WS_URL || API_ENDPOINT.replace(/^http/i, "ws")).replace(/\/$/, "");

const db = {
    notebooks: {
        list: async () => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notebooks`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (response.status === 401) {
                localStorage.removeItem("token");
                window.location.replace("/login");
                return [];
            }
            return await response.json();
        },
        get: async (id) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notebooks/${id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (response.status === 401) {
                localStorage.removeItem("token");
                window.location.replace("/login");
                const error = new Error("Unauthorized");
                error.status = 401;
                throw error;
            }

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const error = new Error(data.detail || "Could not load notebook");
                error.status = response.status;
                throw error;
            }

            return await response.json();
        },
        create: async (name) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notebooks`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ name }),
            });
            return await response.json();
        },
        delete: async (id) => {
            const token = localStorage.getItem("token");
            await fetch(`${API_ENDPOINT}/notebooks/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            return { success: true };
        },
        join: async (invite_code) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notebooks/join`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ invite_code }),
            });
            return await response.json();
        },
        invite: async (id) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notebooks/${id}/invite`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            return await response.json();
        },
        leave: async (id) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notebooks/${id}/leave`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            return await response.json();
        }
    },
    notes: {
        create: async (payload) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notes`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            return { ...data, $id: data.id };
        },
        update: async (id, payload) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/notes/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            return { ...data, $id: data.id };
        },
        delete: async (id) => {
            const token = localStorage.getItem("token");
            await fetch(`${API_ENDPOINT}/notes/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            return { success: true };
        },
        list: async (notebookId) => {
            const token = localStorage.getItem("token");
            if (!token) {
                if (window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
                    window.location.replace("/login");
                }
                return { documents: [] };
            }

            try {
                const url = notebookId 
                    ? `${API_ENDPOINT}/notebooks/${notebookId}/notes`
                    : `${API_ENDPOINT}/notes`; // Fallback or general if needed
                
                const response = await fetch(url, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (response.status === 401) {
                    localStorage.removeItem("token");
                    window.location.replace("/login");
                    return { documents: [] };
                }

                const data = await response.json();
                return {
                    documents: (Array.isArray(data) ? data : []).map((note) => ({ ...note, $id: note.id })),
                };
            } catch (error) {
                console.error("Fetch error:", error);
                return { documents: [] };
            }
        },
    },
    connections: {
        create: async (payload) => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/connections`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            return { ...data, $id: data.id };
        },
        delete: async (id) => {
            const token = localStorage.getItem("token");
            await fetch(`${API_ENDPOINT}/connections/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            return { success: true };
        },
        list: async (notebookId) => {
            const token = localStorage.getItem("token");
            if (!token || !notebookId) {
                return { documents: [] };
            }

            try {
                const response = await fetch(`${API_ENDPOINT}/notebooks/${notebookId}/connections`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (response.status === 401) {
                    localStorage.removeItem("token");
                    window.location.replace("/login");
                    return { documents: [] };
                }

                const data = await response.json();
                return {
                    documents: (Array.isArray(data) ? data : []).map((connection) => ({
                        ...connection,
                        $id: connection.id,
                    })),
                };
            } catch (error) {
                console.error("Fetch connections error:", error);
                return { documents: [] };
            }
        },
    },
    auth: {
        login: async (username, password) => {
            const formData = new FormData();
            formData.append("username", username);
            formData.append("password", password);
            const response = await fetch(`${API_ENDPOINT}/login`, {
                method: "POST",
                body: formData
            });
            return response;
        },
        signup: async (username, email, password) => {
            const response = await fetch(`${API_ENDPOINT}/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password })
            });
            return response;
        },
        getMe: async () => {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_ENDPOINT}/me`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            return response;
        }
    },
    realtime: {
        connectToNotebook: (notebookId) => {
            const token = localStorage.getItem("token");
            return new WebSocket(
                `${REALTIME_ENDPOINT}/ws/notebooks/${notebookId}?token=${encodeURIComponent(token || "")}`
            );
        },
    }
};

export { db };
