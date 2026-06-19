# homebridge-samsung-tizen

[![Donate PayPal](https://img.shields.io/badge/Donate-PayPal-green?logo=paypal&style=flat-square)](https://www.paypal.com/donate?hosted_button_id=5QLCDRNH77Z9L)
[![Buy me a coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-green?logo=buymeacoffee&style=flat-square)](https://www.buymeacoffee.com/tavicu)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?style=flat-square)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm version](https://img.shields.io/npm/v/homebridge-samsung-tizen?style=flat-square)](https://www.npmjs.com/package/homebridge-samsung-tizen)
[![Issues Status](https://img.shields.io/github/issues/tavicu/homebridge-samsung-tizen?style=flat-square)](https://github.com/tavicu/homebridge-samsung-tizen/issues)

## Introduction

Homebridge Samsung Tizen is a plugin created for [Homebridge](https://github.com/homebridge/homebridge) that allows you to control your Samsung TVs *(models starting from 2017)* that are running Tizen Operating System.

Please make sure to [read our shiny documentation](https://tavicu.github.io/homebridge-samsung-tizen/) where you find step by step instructions with images on how to install and configure the plugin.

If you do have problems please make sure to check the [common issues page](https://tavicu.github.io/homebridge-samsung-tizen/troubleshooting/common-issues.html) and in case you want to open a new issue make sure to read details on [how to open a new issue](https://tavicu.github.io/homebridge-samsung-tizen/troubleshooting/open-new-issue.html) so we will have all the details needed to help you!

### [Link to our shiny documentation](https://tavicu.github.io/homebridge-samsung-tizen/) where you can find step by step instructions with images

## Like this plugin?

If you find this plugin useful and want to show your support then please **star this plugin**, or better yet; you can [donate through PayPal](https://www.paypal.com/donate?hosted_button_id=5QLCDRNH77Z9L) whatever you think the plugin value is. You can also use other methods by checking the `Sponsor this project` section from the right sidebar.

Adding new features, maintaining the plugin and responding to issues it's made in my spare time. I really appreciate any help you can give :)

Thank you!

## Fork additions

### Reliable Art Mode (`art_retry`)

> This is a fork addition (not in upstream `tavicu/homebridge-samsung-tizen`).

Frame TVs frequently drop a single "set Art Mode" command — especially right
after the panel wakes from standby — leaving the TV fully on instead of in Art
Mode. This fork makes the Art Mode transition **idempotent and self-verifying**:
after issuing the command it polls the live art-mode status over the existing
art websocket and retries until the desired state is confirmed (or attempts run
out). When the TV is asleep it powers it on, waits for the art-app socket to be
ready, then converges.

Configure per-device (or per-platform) with `art_retry`:

```json
{
    "name": "Bedroom TV",
    "ip": "10.20.30.40",
    "mac": "A0:B1:C2:D3:E4:F5",
    "options": ["Frame.RealPowerMode"],
    "art_retry": {
        "attempts": 5,
        "interval": 1500,
        "wake_timeout": 45000,
        "settle": 1500,
        "fallback_power": true,
        "fallback_settle": 2000
    }
}
```

| Key | Default | Description |
| :--- | :--- | :--- |
| `attempts` | `5` | How many times to issue the command and re-check before giving up. |
| `interval` | `1500` | Delay (ms) between issuing a command and re-reading the status. |
| `wake_timeout` | `45000` | Max time (ms) to wait for the art socket to be ready after waking from standby. |
| `settle` | `1500` | Extra delay (ms) after the socket is ready before issuing the first command. |
| `fallback_power` | `true` | Send a short `KEY_POWER` click when turning Art Mode on cannot be verified through the art websocket. |
| `fallback_settle` | `2000` | Delay (ms) after the `KEY_POWER` fallback before re-reading the status. |

Shorthand forms are also accepted:

- `"art_retry": 8` — set just the number of attempts, defaults for the rest.
- `"art_retry": false` — disable verification entirely (legacy fire-and-forget behaviour).
- Omit the key — uses the defaults above.
