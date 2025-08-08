const { Server } = require('socket.io');
const http = require('http');

const server = http.createServer();
const io = new Server(server);

test('hello world!', (done) => {
	io.on('connection', (socket) => {
		socket.emit('message', 'Hello World');
		socket.on('message', (msg) => {
			expect(msg).toBe('Hello World');
			done();
		});
	});
	server.listen(3000, () => {
		io.emit('message', 'Hello World');
	});
});