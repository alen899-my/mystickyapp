import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import NotesPage from "./pages/NotePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import NotebookPage from "./pages/NotebookPage";
import NotesProvider from "./context/NotesContext";
import { DialogProvider } from "./context/DialogContext";
import Spinner from "./icons/Spinner";
import { db } from "./utils/db";

const PrivateRoute = ({ children }) => {
    const [authState, setAuthState] = useState("checking");

    useEffect(() => {
        let isMounted = true;
        const token = localStorage.getItem("token");

        if (!token) {
            setAuthState("guest");
            return undefined;
        }

        const verifySession = async () => {
            try {
                const response = await db.auth.getMe();

                if (!isMounted) return;

                if (response.ok) {
                    setAuthState("authenticated");
                    return;
                }

                localStorage.removeItem("token");
                setAuthState("guest");
            } catch (error) {
                console.error("Session check failed:", error);
                if (!isMounted) return;

                localStorage.removeItem("token");
                setAuthState("guest");
            }
        };

        verifySession();

        return () => {
            isMounted = false;
        };
    }, []);

    if (authState === "checking") {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
                <Spinner size="88" />
            </div>
        );
    }

    return authState === "authenticated" ? children : <Navigate to="/login" replace />;
};

PrivateRoute.propTypes = {
    children: PropTypes.node.isRequired,
};

const PublicRoute = ({ children }) => {
    const [authState, setAuthState] = useState("checking");

    useEffect(() => {
        let isMounted = true;
        const token = localStorage.getItem("token");

        if (!token) {
            setAuthState("guest");
            return undefined;
        }

        const verifySession = async () => {
            try {
                const response = await db.auth.getMe();

                if (!isMounted) return;

                if (response.ok) {
                    setAuthState("authenticated");
                    return;
                }

                localStorage.removeItem("token");
                setAuthState("guest");
            } catch (error) {
                console.error("Public route session check failed:", error);
                if (!isMounted) return;

                localStorage.removeItem("token");
                setAuthState("guest");
            }
        };

        verifySession();

        return () => {
            isMounted = false;
        };
    }, []);

    if (authState === "checking") {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
                <Spinner size="88" />
            </div>
        );
    }

    return authState === "authenticated" ? <Navigate to="/" replace /> : children;
};

PublicRoute.propTypes = {
    children: PropTypes.node.isRequired,
};

function App() {
  return (
    <div id="app">
        <Router>
            <DialogProvider>
                <NotesProvider>
                    <Routes>
                        <Route
                            path="/login"
                            element={(
                                <PublicRoute>
                                    <LoginPage />
                                </PublicRoute>
                            )}
                        />
                        <Route
                            path="/signup"
                            element={(
                                <PublicRoute>
                                    <SignupPage />
                                </PublicRoute>
                            )}
                        />
                        
                        <Route 
                            path="/" 
                            element={
                                <PrivateRoute>
                                    <NotebookPage />
                                </PrivateRoute>
                            } 
                        />

                        <Route 
                            path="/notebook/:id" 
                            element={
                                <PrivateRoute>
                                    <NotesPage />
                                </PrivateRoute>
                            } 
                        />
                    </Routes>
                </NotesProvider>
            </DialogProvider>
        </Router>
    </div>
  );
}

export default App;
