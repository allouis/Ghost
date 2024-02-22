import {Actor} from './actor.entity';

export interface ActorRepository {
    getOne(): Promise<Actor>
    save(actor: Actor): Promise<void>
}
