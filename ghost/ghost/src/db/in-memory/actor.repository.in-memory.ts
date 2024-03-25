import keypair from 'keypair';
import {Actor} from '../../core/activitypub/actor.entity';
import {ActorRepository} from '../../core/activitypub/actor.repository';
import ObjectID from 'bson-objectid';

export class ActorRepositoryInMemory implements ActorRepository {
    actors: Actor[];

    constructor() {
        const keys = keypair({bits: 128});
        this.actors = [
            Actor.create({
                username: 'index',
                publicKey: keys.public,
                privateKey: keys.private
            })
        ];
    }

    private getOneByUsername(username: string) {
        return this.actors.find(actor => actor.username === username) || null;
    }

    private getOneById(id: ObjectID) {
        return this.actors.find(actor => actor.id.equals(id)) || null;
    }

    async getOne(identifier: string | ObjectID) {
        if (identifier instanceof ObjectID) {
            return this.getOneById(identifier);
        } else {
            return this.getOneByUsername(identifier);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async save(actor: Actor) {
        throw new Error('Not Implemented');
    }
}
