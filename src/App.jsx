import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import NotesPage from "./pages/NotePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import NotebookPage from "./pages/NotebookPage";
import NotesProvider from "./context/NotesContext";

const PrivateRoute = ({ children }) => {
    const token = localStorage.getItem("token");
    return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <div id="app">
        <Router>
            <NotesProvider>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignupPage />} />
                    
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
        </Router>
    </div>
  );
}

export default App;
