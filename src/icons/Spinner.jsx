import PropTypes from "prop-types";
import "../styles/Loader.css";

const Spinner = ({ size = 96, message = "Loading notes...", fullScreen = false }) => {
    const wrapperClassName = fullScreen ? "sticky-loader-shell sticky-loader-shell-screen" : "sticky-loader-shell";

    return (
        <div
            className={wrapperClassName}
            style={{ "--loader-size": `${size}px` }}
            role="status"
            aria-live="polite"
        >
            <div className="sticky-loader-scene">
                <div className="sticky-loader-shadow" />
                <div className="sticky-loader-note sticky-loader-note-back">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="sticky-loader-note sticky-loader-note-front">
                    <div className="sticky-loader-tape" />
                    <span />
                    <span />
                    <span />
                </div>
                <div className="sticky-loader-pin" />
            </div>
            <p className="sticky-loader-message">{message}</p>
        </div>
    );
};

Spinner.propTypes = {
    fullScreen: PropTypes.bool,
    message: PropTypes.string,
    size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export default Spinner;
