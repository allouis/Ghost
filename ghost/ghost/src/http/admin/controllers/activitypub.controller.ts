import {Controller, Get, Inject, Post, Query} from '@nestjs/common';
import {ActorRepository} from '../../../core/activitypub/actor.repository';
import ObjectID from 'bson-objectid';

@Controller('activitypub')
export class ActivityPubController {
    constructor(
        @Inject('ActorRepository') private repository: ActorRepository,
        @Inject('ActivityPubBaseURL') private url: URL
    ) {}

    @Get('')
    async read(@Query() query: any) {
        console.log('read', query);
        if (query.type === 'actor') {
            const actor = await this.repository.getOne(
                ObjectID.createFromHexString(query.id)
            );
            if (!actor) {
                throw new Error('Not Found');
            }
            return actor.getJSONLD(this.url);
        }
        if (query.type === 'key') {
            const actor = await this.repository.getOne(
                ObjectID.createFromHexString(query.owner)
            );
            if (!actor) {
                throw new Error('Not Found');
            }
            return actor.getJSONLD(this.url).publicKey;
        }
        if (query.type === 'inbox') {
            throw new Error('No Permission');
        }
        if (query.type === 'outbox') {
            const actor = await this.repository.getOne(
                ObjectID.createFromHexString(query.owner)
            );
            if (!actor) {
                throw new Error('Not Found');
            }
            const json = actor.getJSONLD(this.url);
            return {
                '@context': 'https://www.w3.org/ns/activitystreams',
                id: json.outbox,
                summary: `Outbox for ${actor.username}`,
                type: 'OrderedCollection',
                totalItems: 1,
                orderedItems: [{
                    type: 'Create',
                    actor: json.id,
                    to: [
                        'https://www.w3.org/ns/activitystreams#Public'
                    ],
                    object: {
                        type: 'Note',
                        name: 'My First Note',
                        content: '<p>Hello, world!</p>',
                        attributedTo: json.id,
                        to: [
                            'https://www.w3.org/ns/activitystreams#Public'
                        ]
                    }
                }]
            };
        }
    }

    @Post('')
    async write() {}
}
