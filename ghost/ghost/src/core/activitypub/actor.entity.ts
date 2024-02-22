import {Entity} from '../../common/entity.base';

type ActorData = {
    username: string;
    preferredUsername: string;
};

export class Actor extends Entity<ActorData> {
    get inbox() {}
    get outbox() {}
}
