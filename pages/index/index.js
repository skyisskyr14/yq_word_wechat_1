const mqttClient = require('../../utils/mqttClient');

const SIMULATION_INTERVAL = 2000;
const DEFAULT_MQTT_CONFIG = {
  host: '1.2.3.4',
  port: 8083,
  path: '/mqtt',
  protocol: 'ws',
  topic: 'sensors/data',
};

const randomInRange = (min, max, fixed = 1) => Number((Math.random() * (max - min) + min).toFixed(fixed));

Page({
  data: {
    connectionStatus: 'disconnected',
    connectionMessage: '',
    detectionRunning: false,
    useSimulation: true,
    sensorValues: {
      temperature: null,
      humidity: null,
      distance: null,
      gas: null,
    },
    thresholds: {
      temperature: 30,
      humidity: 70,
      distance: 100,
      gas: 300,
    },
    lights: {
      dht11: false,
      sr04: false,
      mq2: false,
    },
    mqttConfig: {
      ...DEFAULT_MQTT_CONFIG,
      username: '',
      password: '',
    },
    lastUpdateSource: '未开始检测',
  },

  onLoad() {
    this.simulationTimer = null;
  },

  onUnload() {
    this.stopDetection();
    mqttClient.disconnect();
  },

  handleConfigInput(e) {
    const { key } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      mqttConfig: {
        ...this.data.mqttConfig,
        [key]: key === 'port' ? Number(value) || '' : value,
      },
    });
  },

  handleThresholdInput(e) {
    const { key } = e.currentTarget.dataset;
    const value = Number(e.detail.value);
    this.setData(
      {
        thresholds: {
          ...this.data.thresholds,
          [key]: Number.isNaN(value) ? '' : value,
        },
      },
      () => {
        this.evaluateLights();
      }
    );
  },

  toggleSimulation(e) {
    const useSimulation = e.detail.value;
    this.setData({ useSimulation });
    if (!useSimulation) {
      this.stopSimulation();
    }
  },

  connectMqtt() {
    this.setData({ connectionStatus: 'connecting', connectionMessage: '' });
    mqttClient.disconnect();
    const client = mqttClient.connect(this.data.mqttConfig, {
      onConnect: () => {
        this.setData({ connectionStatus: 'connected', connectionMessage: '' });
        mqttClient.subscribe(this.data.mqttConfig.topic);
      },
      onReconnect: () => {
        this.setData({ connectionStatus: 'reconnecting' });
      },
      onError: (err) => {
        this.setData({
          connectionStatus: 'error',
          connectionMessage: err && err.message ? err.message : '连接失败',
        });
        wx.showToast({ title: 'MQTT连接失败', icon: 'none' });
      },
      onMessage: (topic, payload) => this.handleMqttPayload(topic, payload),
      onFallback: (message) => {
        this.setData({ connectionStatus: 'stub', connectionMessage: message });
      },
    });

    return client;
  },

  handleMqttPayload(topic, payload) {
    let parsed;
    try {
      parsed = JSON.parse(payload.toString());
    } catch (err) {
      console.warn('无法解析MQTT消息', err);
      return;
    }

    const mapped = {
      temperature:
        this.normalizeNumber(parsed.temperature ?? parsed.temp ?? parsed?.dht11?.temperature),
      humidity: this.normalizeNumber(parsed.humidity ?? parsed?.dht11?.humidity),
      distance: this.normalizeNumber(parsed.distance ?? parsed.range ?? parsed?.sr04),
      gas: this.normalizeNumber(parsed.gas ?? parsed.smoke ?? parsed?.mq2),
    };

    this.applyIncomingData(mapped, 'MQTT');
  },

  normalizeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  },

  startDetection() {
    if (this.data.detectionRunning) {
      return;
    }

    this.setData({ detectionRunning: true });
    this.connectMqtt();
    if (this.data.useSimulation) {
      this.startSimulation();
    }
  },

  stopDetection() {
    if (!this.data.detectionRunning && !this.simulationTimer) {
      return;
    }
    this.setData({ detectionRunning: false });
    this.stopSimulation();
  },

  startSimulation() {
    this.stopSimulation();
    this.simulationTimer = setInterval(() => {
      const simulated = {
        temperature: randomInRange(18, 36, 1),
        humidity: randomInRange(40, 90, 0),
        distance: randomInRange(10, 200, 0),
        gas: randomInRange(50, 500, 0),
      };
      this.applyIncomingData(simulated, '模拟数据');
    }, SIMULATION_INTERVAL);
  },

  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  },

  applyIncomingData(values, source) {
    const merged = { ...this.data.sensorValues };

    Object.keys(values).forEach((key) => {
      if (values[key] === null || values[key] === undefined) {
        return;
      }
      merged[key] = Number(values[key].toFixed(1));
    });

    this.setData(
      {
        sensorValues: merged,
        lastUpdateSource: source,
      },
      () => this.evaluateLights()
    );
  },

  evaluateLights() {
    const { sensorValues, thresholds } = this.data;
    const over = (value, threshold) => Number.isFinite(value) && Number.isFinite(threshold) && value > threshold;

    const dht11Light =
      over(sensorValues.temperature, thresholds.temperature) ||
      over(sensorValues.humidity, thresholds.humidity);
    const sr04Light = over(sensorValues.distance, thresholds.distance);
    const mq2Light = over(sensorValues.gas, thresholds.gas);

    this.setData({
      lights: {
        dht11: dht11Light,
        sr04: sr04Light,
        mq2: mq2Light,
      },
    });
  },

  resetData() {
    this.stopDetection();
    this.setData({
      sensorValues: {
        temperature: null,
        humidity: null,
        distance: null,
        gas: null,
      },
      lights: {
        dht11: false,
        sr04: false,
        mq2: false,
      },
      lastUpdateSource: '已重置',
    });
  },
});
