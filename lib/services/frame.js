let Hap;

module.exports = class Frame {
    constructor(accessory, homebridge) {
        Hap = homebridge.hap;

        this.device    = accessory.device;
        this.services  = [];

        this.createService();
    }

    createService() {
        const prefixName = this.device.hasOption('Switch.DeviceName.Disable') ? '' : `${this.device.config.name} `;

        if (!this.device.hasOption('Frame.ArtSwitch.Disable')) {
            let name    = prefixName + 'Art Mode';
            let service = new Hap.Service.Switch(name, 'frame.art');

            this._nameService(service, name);

            service.getCharacteristic(Hap.Characteristic.On)
                .on('get', this.getArtMode.bind(this))
                .on('set', this.setArtMode.bind(this));

            this.services.push(service);
        }

        if (!this.device.hasOption('Frame.PowerSwitch.Disable')) {
            let name    = prefixName + 'Power';
            let service = new Hap.Service.Switch(name, 'frame.power');

            this._nameService(service, name);

            service.getCharacteristic(Hap.Characteristic.On)
                .on('get', this.getPower.bind(this))
                .on('set', this.setPower.bind(this));

            this.services.push(service);
        }
    }

    /**
     * Publish a stable, human-readable name on a switch service.
     *
     * The Frame Art/Power switches are extra Switch *services* on the TV
     * accessory. Without an explicit Name characteristic, the Home app falls
     * back to the accessory name, so every switch shows up identically (e.g.
     * "Bedroom TV"). Setting Name (and ConfiguredName when available) makes
     * each switch distinct in the Home app.
     *
     * @param {object} service the HAP Switch service
     * @param {string} name    display name to publish
     */
    _nameService(service, name) {
        try {
            service.setCharacteristic(Hap.Characteristic.Name, name);
        } catch (error) { /* Name characteristic always exists; ignore */ }

        if (Hap.Characteristic.ConfiguredName) {
            try {
                if (!service.testCharacteristic(Hap.Characteristic.ConfiguredName)) {
                    service.addCharacteristic(Hap.Characteristic.ConfiguredName);
                }

                service.setCharacteristic(Hap.Characteristic.ConfiguredName, name);
            } catch (error) { /* optional; ignore if unsupported */ }
        }
    }

    refreshValue() {
        this.services.forEach(service => {
            if (service.subtype === 'frame.art') {
                this.getArtMode((error, value) => {
                    service.updateCharacteristic(Hap.Characteristic.On, value);
                });
            }

            if (service.subtype === 'frame.power') {
                this.getPower((error, value) => {
                    service.updateCharacteristic(Hap.Characteristic.On, value);
                });
            }
        });
    }

    updateValue(value, service) {
        service = service || this.services[0];

        if (service) {
            service.getCharacteristic(Hap.Characteristic.On).updateValue(value);
        }
    }

    async getArtMode(callback) {
        this.device.remote.getArtMode().then(status => {
            callback(null, status);
        });
    }

    async setArtMode(value, callback) {
        this.device.remote.setArtMode(value).then(() => {
            callback();
        })
        .catch(error => {
            this.device.log.error(error.message);
            this.device.log.debug(error.stack);

            callback(error);
        });
    }

    async getPower(callback) {
        this.device.remote.getPower().then(status => {
            callback(null, status);
        });
    }

    async setPower(value, callback) {
        this.device.remote.setPower(value).then(() => {
            callback();
        })
        .catch(error => {
            this.device.log.error(error.message);
            this.device.log.debug(error.stack);

            callback(error);
        });
    }
}
