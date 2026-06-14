/**
 * Normalise the Art Mode verify/retry configuration.
 *
 * The Frame TV's art-app does not reliably honour a single "set art mode"
 * command, especially right after the panel wakes from standby. This option
 * controls a converge loop that, after issuing the command, polls the live
 * art-mode status and retries until the desired state is confirmed.
 *
 * Accepted config shapes (per-device or per-platform):
 *   art_retry: false                      -> disable verification (legacy fire-and-forget)
 *   art_retry: true | undefined           -> use defaults
 *   art_retry: 8                          -> number = attempts, rest default
 *   art_retry: {                          -> object, any subset of:
 *     attempts:     <int>   number of verify attempts (>=1)
 *     interval:     <ms>    delay between issuing a command and re-checking
 *     wake_timeout: <ms>    max time to wait for the art socket to be ready
 *                           after powering the TV on from standby
 *     settle:       <ms>    extra delay after the socket reports ready before
 *                           issuing the first art command
 *   }
 *
 * @param {object} config device config (already merged with platform config)
 * @returns {object|false} normalised settings, or false when disabled
 */

const DEFAULTS = {
    attempts:     { value: 5,         min: 1 },
    interval:     { value: 1500,      min: 250 },
    wake_timeout: { value: 1000 * 45, min: 1000 },
    settle:       { value: 1500,      min: 0 }
};

module.exports = function(config) {
    let raw = config.art_retry;

    // Explicitly disabled
    if (raw === false) {
        return false;
    }

    // Shorthand: number = attempts
    if (typeof raw === 'number') {
        raw = { attempts: raw };
    }

    // true / undefined / anything non-object => defaults
    if (typeof raw !== 'object' || raw === null) {
        raw = {};
    }

    let output = {};

    for (let key in DEFAULTS) {
        let value = raw.hasOwnProperty(key) ? Number(raw[key]) : NaN;

        if (isNaN(value)) {
            value = DEFAULTS[key].value;
        } else if (value < DEFAULTS[key].min) {
            value = DEFAULTS[key].min;
        }

        output[key] = value;
    }

    return output;
}
