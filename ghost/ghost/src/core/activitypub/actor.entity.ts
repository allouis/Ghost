import {Entity} from '../../common/entity.base';
import {ActivityPub} from './types';

type ActorData = {
    type: 'Person'
    username: string;
    preferredUsername: string;
    publicKey: string;
    privateKey: string;
};

function makeUrl(base: URL, props: Map<string, string>): URL {
    const url = new URL(base.href);
    for (const [key, value] of props.entries()) {
        url.searchParams.set(key, value);
    }
    return url;
}

export class Actor extends Entity<ActorData> {
    get username() {
        return this.attr.username;
    }

    getJSONLD(url: URL): ActivityPub.Actor & ActivityPub.RootObject {
        const actor = makeUrl(url, new Map([
            ['type', 'actor'],
            ['id', this.id.toHexString()]
        ]));

        const publicKey = makeUrl(url, new Map([
            ['type', 'key'],
            ['owner', this.id.toHexString()]
        ]));

        const inbox = makeUrl(url, new Map([
            ['type', 'inbox'],
            ['owner', this.id.toHexString()]
        ]));

        const outbox = makeUrl(url, new Map([
            ['type', 'outbox'],
            ['owner', this.id.toHexString()]
        ]));

        return {
            '@context': 'https://www.w3.org/ns/activitystreams',
            type: this.attr.type,
            id: actor.href,
            inbox: inbox.href,
            outbox: outbox.href,
            username: this.attr.username,
            preferredUsername: this.attr.preferredUsername,
            publicKey: {
                id: publicKey.href,
                owner: actor.href,
                publicKeyPem: this.attr.publicKey
            }
        };
    }

    static create(data: any) {
        return new Actor({
            type: 'Person',
            username: data.username,
            preferredUsername: data.username,
            publicKey: '',
            privateKey: ''
        });
    }
}
