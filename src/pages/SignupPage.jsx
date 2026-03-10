import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../utils/db";
import { signupSchema } from "../schemas/authSchema";
import { AlertCircle, UserPlus, StickyNote } from "lucide-react";
import "../styles/Auth.css";

const SignupPage = () => {
    const [formData, setFormData] = useState({
        username: "", email: "", password: "", confirmPassword: ""
    });
    const [errors, setErrors]     = useState({});
    const [serverError, setServerError] = useState("");
    const [loading, setLoading]   = useState(false);
    const navigate = useNavigate();

    const handleChange = (field) => (e) =>
        setFormData(prev => ({ ...prev, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});
        setServerError("");
        setLoading(true);

        const result = signupSchema.safeParse(formData);
        if (!result.success) {
            const fe = {};
            result.error.issues.forEach(i => { fe[i.path[0]] = i.message; });
            setErrors(fe);
            setLoading(false);
            return;
        }

        try {
            const res  = await db.auth.signup(formData.username, formData.email, formData.password);
            const data = await res.json();
            if (res.ok) {
                navigate("/login");
            } else {
                setServerError(data.detail || "Signup failed. Try a different username.");
            }
        } catch {
            setServerError("Can't reach the server. Is it running?");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Logo */}
            <div className="auth-brand">
                <StickyNote size={20} color="rgba(255,235,161,0.7)" strokeWidth={2} />
                <span className="auth-brand-name">MySticky</span>
            </div>

            {/* Sticky Note Card */}
            <div className="auth-card signup-card">
                <h2>Join the board! ✨</h2>
                <p>Create your free sticky workspace</p>

                {serverError && (
                    <div className="auth-error">
                        <AlertCircle size={14} />
                        {serverError}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={formData.username}
                            onChange={handleChange("username")}
                            className={errors.username ? "input-error" : ""}
                            placeholder="johndoe"
                            autoComplete="username"
                            required
                        />
                        {errors.username && <span className="error-text">{errors.username}</span>}
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={handleChange("email")}
                            className={errors.email ? "input-error" : ""}
                            placeholder="name@example.com"
                            autoComplete="email"
                            required
                        />
                        {errors.email && <span className="error-text">{errors.email}</span>}
                    </div>

                    {/* Password side by side */}
                    <div className="pw-grid">
                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={handleChange("password")}
                                className={errors.password ? "input-error" : ""}
                                placeholder="min 6 chars"
                                autoComplete="new-password"
                                required
                            />
                            {errors.password && <span className="error-text">{errors.password}</span>}
                        </div>
                        <div className="form-group">
                            <label>Confirm</label>
                            <input
                                type="password"
                                value={formData.confirmPassword}
                                onChange={handleChange("confirmPassword")}
                                className={errors.confirmPassword ? "input-error" : ""}
                                placeholder="repeat"
                                autoComplete="new-password"
                                required
                            />
                            {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                        </div>
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? "Creating account..." : <><UserPlus size={16} /> Create Account</>}
                    </button>
                </form>

                <p className="auth-footer">
                    Already have an account? <Link to="/login">Sign in →</Link>
                </p>
            </div>
        </div>
    );
};

export default SignupPage;
