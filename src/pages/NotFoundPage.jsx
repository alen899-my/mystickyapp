import PropTypes from "prop-types";
import { ArrowLeft, Compass, Home, StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "../styles/NotFound.css";

const NotFoundPage = ({
    code = "404",
    title = "This sticky went missing",
    message = "The page you were looking for is not here anymore, or it may have never been pinned to this board.",
    primaryLabel = "Back to Dashboard",
    primaryTo = "/",
    secondaryLabel = "Go Back",
}) => {
    const navigate = useNavigate();

    return (
        <main className="not-found-page">
            <div className="not-found-float not-found-float-left" />
            <div className="not-found-float not-found-float-right" />

            <section className="not-found-card">
                <div className="not-found-tape" />

                <div className="not-found-badge">
                    <StickyNote size={18} strokeWidth={2.2} />
                    Lost Page
                </div>

                <div className="not-found-code">{code}</div>
                <h1>{title}</h1>
                <p>{message}</p>

                <div className="not-found-sketch">
                    <div className="not-found-sketch-line" />
                    <div className="not-found-sketch-line short" />
                    <div className="not-found-sketch-row">
                        <Compass size={18} strokeWidth={2.2} />
                        <span>Try returning to your notebooks and opening the board again.</span>
                    </div>
                </div>

                <div className="not-found-actions">
                    <button
                        type="button"
                        className="not-found-btn not-found-btn-primary"
                        onClick={() => navigate(primaryTo)}
                    >
                        <Home size={16} strokeWidth={2.3} />
                        {primaryLabel}
                    </button>
                    <button
                        type="button"
                        className="not-found-btn not-found-btn-secondary"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft size={16} strokeWidth={2.3} />
                        {secondaryLabel}
                    </button>
                </div>
            </section>
        </main>
    );
};

NotFoundPage.propTypes = {
    code: PropTypes.string,
    message: PropTypes.string,
    primaryLabel: PropTypes.string,
    primaryTo: PropTypes.string,
    secondaryLabel: PropTypes.string,
    title: PropTypes.string,
};

export default NotFoundPage;
