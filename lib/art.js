let ws    = require('ws');
let utils = require('./utils');

const {
    ArtSocketOpenError
} = require('./errors');

const REFRESH_INTERVAL  = 5 * 1000; // 5 seconds
const HEARTBEAT_TIMEOUT = 8 * 1000; // 8 seconds (6 ping + 2 for safety)

module.exports = class Art {
    constructor(device) {
        this.data   = {};
        this.status = null;
        this.name   = device.config.name || 'SamsungTvArt';
        this.url    = `ws://${device.config.ip}:8001/api/v2/channels/com.samsung.art-app?name=${this._encodeName()}`;

        this.device = device;

        this._refresh();

        this.device.on('destroy', () => this.destroy());

        // Emit init event
        setTimeout(() => this.device.emit('artmode.init'));
    }

    destroy() {
        this.destroyed = true;
        this._close();
    }

    getStatus() {
        return Promise.resolve(!!this.status);
    }

    setStatus(value) {
        this._updateStatus(value, {
            manual: true
        });

        // Save that we change status manually
        this.skipStatusUpdate = true;

        return this._send({
            value: value ? 'on' : 'off',
            request: 'set_artmode_status'
        }).finally(() => {
            // Reset changing status manually
            setTimeout(() => this.skipStatusUpdate = false, 3000);
        });
    }

    /**
     * Whether the art websocket is currently open and ready to receive commands.
     * @return {boolean}
     */
    isReady() {
        return !!this.socket && this.socket.readyState === ws.OPEN;
    }

    /**
     * Wait until the art websocket is connected/ready, up to a timeout.
     * Used after the panel is woken from standby so we don't fire the art
     * command before the art-app can accept it.
     * @param {number} timeout max wait in ms
     * @return {Promise<boolean>} true if ready, false if timed out
     */
    async waitReady(timeout = 45000) {
        let waited = 0;
        const step = 500;

        while (!this.destroyed && waited <= timeout) {
            try {
                await this._check();
                if (this.isReady()) { return true; }
            } catch (error) {
                // socket not up yet; keep polling
            }

            await utils.delay(step);
            waited += step;
        }

        return this.isReady();
    }

    /**
     * Set the art-mode status and verify it actually took effect, retrying as
     * needed. Reuses the persistent socket and the live status that the TV
     * pushes back via 'art_mode_changed' / 'artmode_status' events, rather than
     * opening a new connection per probe (which the panel throttles).
     *
     * @param {boolean} value   desired art-mode state
     * @param {object}  options { attempts, interval }
     * @return {Promise<boolean>} true if the desired state was confirmed
     */
    async setStatusVerified(value, options = {}) {
        const attempts = Math.max(1, parseInt(options.attempts) || 1);
        const interval = Math.max(0, parseInt(options.interval) || 1500);

        for (let attempt = 1; attempt <= attempts; attempt++) {
            // Issue the command (this also optimistically updates this.status).
            try {
                await this.setStatus(value);
            } catch (error) {
                this.device.log.debug(`Art verify: set attempt ${attempt} failed: ${error.message}`);
            }

            // Give the panel time to act, then ask it for the real status.
            await utils.delay(interval);

            let confirmed = await this._probeStatus();

            if (confirmed === value) {
                this.device.log.debug(`Art verify: confirmed ${value ? 'on' : 'off'} on attempt ${attempt}`);
                return true;
            }

            this.device.log.debug(`Art verify: attempt ${attempt}/${attempts} not yet ${value ? 'on' : 'off'} (got ${confirmed})`);
        }

        this.device.log.error(`Art verify: failed to set art mode ${value ? 'on' : 'off'} after ${attempts} attempts`);
        return false;
    }

    /**
     * Ask the TV for its current art-mode status and resolve once the live
     * status has been refreshed. Falls back to the cached status on error.
     * @return {Promise<boolean>}
     */
    async _probeStatus() {
        // Temporarily allow status updates even if we just set manually,
        // so we read the TV's truth rather than our optimistic value.
        let previousSkip = this.skipStatusUpdate;
        this.skipStatusUpdate = false;

        try {
            await this._send({ request: 'get_artmode_status' });
            // The response is handled asynchronously in _open()'s message
            // handler which calls _updateStatus(); give it a brief moment.
            await utils.delay(300);
        } catch (error) {
            this.device.log.debug(`Art verify: probe failed: ${error.message}`);
        } finally {
            this.skipStatusUpdate = previousSkip;
        }

        return !!this.status;
    }

    async _send(data) {
        this.device.log.debug(data);

        // Check socket
        await this._check();

        // Stop heartbeat while sending
        clearTimeout(this.heartbeat);

        await new Promise(resolve => this.socket.send(JSON.stringify({
            method : 'ms.channel.emit',
            params : {
                data  : JSON.stringify(Object.assign({
                    id: this.data.id || 'noop-id'
                },data)),
                to    : 'host',
                event : 'art_app_request'
            }
        }), () => resolve()));
    }

    async _check() {
        if (this.destroyed) {
            return Promise.resolve();
        }

        if (this.socket) {
            if (this.socket.readyState == ws.OPEN) {
                return Promise.resolve();
            }

            if (this.socket.readyState == ws.CONNECTING) {
                return new Promise(resolve => setTimeout(() => resolve(this._check()), 500));
            }
        }

        try {
            await this._open();
            await utils.delay(150);
        } catch(error) {
            throw new ArtSocketOpenError(error.message);
        }
    }

    _open() {
        return new Promise((resolve, reject) => {
            this.socket = new ws(this.url, {
                servername: '',
                handshakeTimeout: 15 * 1000,
                rejectUnauthorized: false
            })
            .on('error', error => reject(new ArtSocketOpenError(error.message)))
            .on('ping', () => this._heartbeat())
            .on('message', response => {
                response = JSON.parse(response);

                this.device.log.debug(response);

                if (response.event === 'ms.channel.connect') {
                    this.data = response.data;

                } else if (response.event === 'ms.channel.ready') {
                    resolve();

                    this._sendUpdateStatus();

                } else if (response.event === 'd2d_service_message') {
                    let data = JSON.parse(response.data);

                    if (data.event === 'artmode_status') {
                        this._updateStatus(data.value === 'on');

                    } else if (data.event === 'art_mode_changed') {
                        this._updateStatus(data.status === 'on');

                    } else if (data.event === 'go_to_standby') {
                        this.device.emit('standby');

                    } else if (data.event === 'wakeup') {
                        this.device.emit('wakeup');
                    }

                } else {
                    reject(new ArtSocketOpenError(null, response));
                }
            });
        });
    }

    _close() {
        if (this.socket) {
            this.socket.terminate();
        }
    }

    _refresh() {
        this._sendUpdateStatus()
            .then(() => REFRESH_INTERVAL)
            .catch(() => 250)
            .then(timeout => setTimeout(() => this._refresh(), timeout || 250));
    }

    _heartbeat() {
        clearTimeout(this.heartbeat);

        this.heartbeat = setTimeout(() => this._close(), HEARTBEAT_TIMEOUT);
    }

    _updateStatus(value, options = {}) {
        let oldValue = this.status;
        this.status  = value;

        if (value != oldValue || options.manual) {
            this.device.emit('artmode.change', this.status);
        }
    }

    _sendUpdateStatus() {
        if (this.skipStatusUpdate) {
            return Promise.resolve();
        }

        return this._send({request: 'get_artmode_status'});
    }

    /**
     * Encode TV name to base64
     * @return {string}
     */
    _encodeName() {
        return Buffer.from(this.name).toString('base64');
    }
}
