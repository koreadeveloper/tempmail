const Redis = require('ioredis');
const simpleParser = require('mailparser').simpleParser;

exports.register = function () {
    const plugin = this;

    plugin.redis_host = process.env.REDIS_HOST || 'localhost';
    plugin.redis_port = process.env.REDIS_PORT || 6379;

    plugin.loginfo(`Initializing Redis connection to ${plugin.redis_host}:${plugin.redis_port}`);

    plugin.redis = new Redis({
        host: plugin.redis_host,
        port: plugin.redis_port
    });
}

exports.hook_data = function (next, connection) {
    connection.transaction.parse_body = true;
    next();
}

exports.hook_data_post = async function (next, connection) {
    const plugin = this;
    const transaction = connection.transaction;
    const emailTo = transaction.rcpt_to[0].address().toLowerCase(); // Assuming single recipient for simplicity or handle loop

    plugin.loginfo(`Received email for: ${emailTo}`);

    try {
        // We can get the raw stream or parsed body. 
        // Haraka provides message_stream, but mailparser works best with a stream or buffer.
        // transaction.message_stream is a ReadableStream.

        let buffer = Buffer.alloc(0);
        transaction.message_stream.on('data', data => {
            buffer = Buffer.concat([buffer, data]);
        });

        transaction.message_stream.on('end', async () => {
            try {
                const parsed = await simpleParser(buffer);

                const mailData = {
                    from: parsed.from.text,
                    subject: parsed.subject,
                    text: parsed.text,
                    html: parsed.html,
                    date: parsed.date,
                    to: emailTo
                };

                const redisKey = `inbox:${emailTo}`;

                // Save to Redis
                await plugin.redis.rpush(redisKey, JSON.stringify(mailData));

                // Set Expiry (1 hour)
                await plugin.redis.expire(redisKey, 3600);

                // Publish event
                await plugin.redis.publish('new_mail', emailTo);

                plugin.loginfo(`Saved email for ${emailTo} to Redis and published event.`);
                next();
            } catch (err) {
                plugin.logerror(`Error processing email: ${err.message}`);
                next(OK); // Accept anyway to avoid bouncing if our logic fails, or DENY if critical
            }
        });

        // We shouldn't call next() here immediately because the stream is async. 
        // But hook_data_post expects us to drive the flow.
        // However, Haraka streams might be already consumed? 
        // Alternative: use hook_queue which happens after data is fully received.
        // hook_queue is probably safer for full message processing.

    } catch (e) {
        plugin.logerror(e);
        next();
    }
}

// Switching to hook_queue for safety as the message is complete then.
exports.hook_queue = async function (next, connection) {
    const plugin = this;
    const transaction = connection.transaction;

    // We need to capture recipients.
    const recipients = transaction.rcpt_to.map(rcpt => rcpt.address().toLowerCase());

    plugin.loginfo(`Processing email in queue for: ${recipients.join(', ')}`);

    // Get the raw message
    // transaction.message_stream.pipe(...)
    // But in hook_queue, the message is effectively done. 
    // We can just get the body. 
    // Actually, mailparser needs the raw source including headers.

    // Let's use a simpler approach for the stream capture if possible, 
    // or transaction.body if it's already parsed by Haraka (lightweight).
    // But PRD asks for `mailparser`.

    // In hook_queue, `transaction.message_stream` is available.

    const stream = transaction.message_stream;
    let chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        try {
            const parsed = await simpleParser(buffer);

            const mailData = {
                from: parsed.from ? parsed.from.text : 'Unknown',
                subject: parsed.subject,
                text: parsed.text,
                html: parsed.html, // Security: This will be sanitized on frontend
                date: parsed.date || new Date(),
            };

            for (const emailTo of recipients) {
                const redisKey = `inbox:${emailTo}`;

                await plugin.redis.rpush(redisKey, JSON.stringify(mailData));
                await plugin.redis.expire(redisKey, 3600);
                await plugin.redis.publish('new_mail', emailTo);
                plugin.loginfo(`Saved for ${emailTo}`);
            }

            next(OK); // Accept the mail
        } catch (err) {
            plugin.logerror(`Parsing failed: ${err}`);
            next(OK); // Accept anyway
        }
    });
}
