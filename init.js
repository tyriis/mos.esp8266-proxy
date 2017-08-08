load('api_config.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');
load('api_http.js');
load('api_log.js');
load("api_uart.js");
load('api_neopixel.js');
// esp8266_D6025B
let topic = {
  status: 'node/' + Cfg.get('device.id') + '/status',
  action: 'node/' + Cfg.get('device.id') + '/action'
};

let uartNo = 0;

let getInfo = function() {
  return JSON.stringify({total_ram: Sys.total_ram(), free_ram: Sys.free_ram(), id: Cfg.get('device.id'), uptime: Sys.uptime()});
};

let setPixel = function (red, green, blue) {
  pixel.clear();
  pixel.setPixel(0, red, green, blue);
  pixel.show();
};

let pixelPin = 5;
let pixel = NeoPixel.create(pixelPin, 1, NeoPixel.GRB);
setPixel(0, 0, 0);

// Monitor network connectivity.
Net.setStatusEventHandler(function(ev, arg) {
  let evs = "???";
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = "DISCONNECTED";
    setPixel(15, 0, 0);
  } else if (ev === Net.STATUS_CONNECTING) {
    setPixel(15, 0, 0);
    evs = "CONNECTING";
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = "CONNECTED";
    setPixel(15, 15, 0);
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = "GOT_IP";
    setPixel(0, 15, 0);
  }
  // print("== Net event:", ev, evs);
}, null);

MQTT.setEventHandler(function(conn, ev, edata) {
  if (ev === 202 /* MQTT CONNACK*/) {
    MQTT.pub(topic.status, getInfo(), 1);
    setPixel(0, 15, 15);
    Timer.set(10000, 0, function() {
      UART.write(uartNo, "/temperature\r\n");
      UART.write(uartNo, "/humidity\r\n");
    });
  }
}, null);

UART.setConfig(uartNo, {
  baudRate: 115200,
  esp8266: {
    rx: 3,
    tx: 1
  },
});

UART.setRxEnabled(uartNo, true);
UART.setDispatcher(uartNo, function(uartNo, ud) {
  let ra = UART.readAvail(uartNo);
  if (ra > 0) {
    let data = UART.read(uartNo);
    if (data) {
      let obj = JSON.parse(data.slice(0, -2));
      if (obj.sensor === 'PIR') {
        if (obj.value === 1) {
          setPixel(0, 0, 255);
        } else {
          setPixel(0, 0, 15);
        }
      }
      MQTT.pub(topic.status, data.slice(0, -2), 1);
    }
  }
}, null);

MQTT.sub(topic.action, function(conn, _topic, msg) {
  if (msg[0] === '/') {
    UART.write(uartNo, msg + "\r\n");
  } else {
    let obj = JSON.parse(msg);
    if (obj.command === 'setPixel') {
      setPixel(obj.value[0], obj.value[1], obj.value[2]);
    } else if (obj.command === 'getInfo') {
      MQTT.pub(topic.status, getInfo());
    } else if (obj.command === 'getTemperature') {
      UART.write(uartNo, "/temperature\r\n");
    } else if (obj.action === 'get') {
      if (obj.value === 'temperature') {
        UART.write(uartNo, "/temperature\r\n");
      }
    }
  }
}, null);
