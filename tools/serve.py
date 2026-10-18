# 本地静态服务器：禁用缓存 + 抗并发（照片一次几十张并发加载时不能被拒）
# 用法：python tools/serve.py [端口] [绑定地址]
import http.server, socketserver, sys, os, functools

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
# 默认绑 0.0.0.0：本机用 127.0.0.1 打开，手机用局域网 IP 打开，都能用
HOST = sys.argv[2] if len(sys.argv) > 2 else '0.0.0.0'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1：keep-alive，几十张图连载时少开一堆连接
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    # 关键：默认 backlog 只有 5，浏览器一次并发拉几十张照片时会被直接拒掉（Connection reset / refused）
    request_queue_size = 256
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with Server((HOST, PORT), handler) as httpd:
        print(f'http://127.0.0.1:{PORT}/  (root: {ROOT})')
        httpd.serve_forever()
