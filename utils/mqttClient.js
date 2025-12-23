/**
 * MQTT客户端封装
 * - 优先尝试加载 mqtt.min.js（需放置在 /libs/mqtt.min.js）
 * - 如果未找到或加载失败，使用占位客户端，仅触发回调提示。
 */
/* eslint-disable no-console */
const DEFAULT_OPTIONS = {
  host: '1.2.3.4',
  port: 8083,
  path: '/mqtt',
  protocol: 'ws',
  username: '',
  password: '',
  clientId: `miniapp_${Math.random().toString(16).slice(2, 10)}`,
};

let mqttLib = null;
try {
  // 需要在项目根目录的 libs/mqtt.min.js 提前准备好
  mqttLib = require('../libs/mqtt.min');
} catch (err) {
  console.warn('未找到 mqtt.min.js，将使用占位客户端。', err);
}

let client = null;

const buildUrl = ({ protocol, host, port, path }) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${protocol}://${host}:${port}${normalizedPath}`;
};

const attachCallbacks = (instance, handlers) => {
  const { onConnect, onReconnect, onError, onMessage, onFallback } = handlers;
  if (!instance || !instance.on) return;

  instance.on('connect', () => onConnect && onConnect());
  instance.on('reconnect', () => onReconnect && onReconnect());
  instance.on('error', (err) => onError && onError(err));
  instance.on('message', (topic, payload) => onMessage && onMessage(topic, payload));
  instance.on('close', () => {
    if (instance._placeholder) {
      onFallback && onFallback('使用占位 MQTT 客户端，未建立真实连接');
    }
  });
};

const connect = (config = {}, handlers = {}) => {
  const options = { ...DEFAULT_OPTIONS, ...config };

  if (!mqttLib || !mqttLib.connect) {
    // 占位客户端：不真正连接，但保持接口一致
    client = {
      _placeholder: true,
      subscribe() {},
      publish() {},
      end() {},
      on() {},
    };
    handlers.onFallback &&
      handlers.onFallback('未找到 mqtt 库，已切换到占位客户端（仅用于模拟/本地调试）。');
    return client;
  }

  const url = buildUrl(options);
  client = mqttLib.connect(url, {
    username: options.username,
    password: options.password,
    clientId: options.clientId,
    clean: true,
    reconnectPeriod: 2000,
    keepalive: 60,
  });

  attachCallbacks(client, handlers);
  return client;
};

const subscribe = (topic, options = {}) => {
  if (!client || client._placeholder) return;
  client.subscribe(topic, options);
};

const publish = (topic, message, options = {}) => {
  if (!client || client._placeholder) return;
  client.publish(topic, message, options);
};

const disconnect = () => {
  if (!client) return;
  if (client.end) {
    client.end();
  }
  client = null;
};

module.exports = {
  connect,
  subscribe,
  publish,
  disconnect,
};
